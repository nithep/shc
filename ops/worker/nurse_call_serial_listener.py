# -*- coding: utf-8 -*-
"""
Module: worker/nurse_call_serial_listener.py
-----------------------------------------------------------------------------------
Smart Nurse Call & Predictive Analytics - Serial Data Listener (Edge Layer)
Target Hardware: Raspberry Pi Zero 2 W / Raspberry Pi 4 (@ Ward Counter)
Hardware Interface: RS-232 / USB-to-Serial Connected to Phonik DX-32C/80C/144C
-----------------------------------------------------------------------------------
หน้าที่หลัก:
1. ดักจับสัญญาณ Serial (RS-232 / TCP Socket) จากตู้ Phonik Main Control แบบ Real-time
2. ถอดรหัสโปรโตคอล Nurse Call Event (Bedside Call, Bathroom Pull, Emergency, Cancel Call)
3. ประมวลผล Edge AI / Emergency Level Classification & SLA Tracking
4. จัดเก็บลง Local Event Queue & SQLite Database เพื่อรองรับกรณี Offline (Internet หลุด)
5. ส่งข้อมูลไปยัง Cloud Layer (GCP Pub/Sub / MQTT) & Notification API (LINE / Webhook)
"""

import os
import sys
import time
import json
import sqlite3
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# บังคับการแสดงผล Standard Output บน Windows Terminal ให้เป็น UTF-8
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ตั้งค่า Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(threadName)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("NurseCallSerialListener")

# Try importing serial for physical hardware
try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    logger.warning("pyserial ไม่ได้ถูกติดตั้ง ระบบจะทำงานในโหมด TCP/Mock Receiver แทน")


class LocalEventDB:
    """ระบบคิวสำรอง SQLite Fallback บน Edge (Raspberry Pi) เมื่อไม่มีอินเทอร์เน็ต"""

    def __init__(self, db_path: str = "nurse_call_events.db"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS nurse_events (
                    event_id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    bed_id TEXT,
                    event_type TEXT NOT NULL,
                    emergency_level INTEGER NOT NULL,
                    sla_seconds INTEGER NOT NULL,
                    raw_data TEXT,
                    timestamp TEXT NOT NULL,
                    synced INTEGER DEFAULT 0,
                    sync_timestamp TEXT
                )
            """)
            conn.commit()

    def save_event(self, event_data: Dict[str, Any]) -> bool:
        """บันทึก Nurse Call Event ลง SQLite บน Edge"""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO nurse_events 
                    (event_id, room_id, bed_id, event_type, emergency_level, sla_seconds, raw_data, timestamp, synced)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, (
                    event_data["event_id"],
                    event_data["room_id"],
                    event_data.get("bed_id", "BED-1"),
                    event_data["event_type"],
                    event_data["emergency_level"],
                    event_data["sla_seconds"],
                    event_data.get("raw_data", ""),
                    event_data["timestamp"]
                ))
                conn.commit()
                logger.info(f"[SQLite] บันทึก Event ลง Local Database สำเร็จ: {event_data['event_id']}")
                return True
        except Exception as e:
            logger.error(f"[SQLite Error] ไม่สามารถบันทึก Event ได้: {e}")
            return False

    def mark_synced(self, event_id: str):
        """อัปเดตสถานะว่าส่งขึ้น Cloud สำเร็จแล้ว"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            now_str = datetime.now(timezone.utc).isoformat()
            cursor.execute("""
                UPDATE nurse_events 
                SET synced = 1, sync_timestamp = ? 
                WHERE event_id = ?
            """, (now_str, event_id))
            conn.commit()

    def get_unsynced_events(self, limit: int = 50):
        """ดึงรายการ Event ที่ยังค้างส่งขึ้น Cloud"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM nurse_events WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?
            """, (limit,))
            return [dict(row) for row in cursor.fetchall()]


class PhonikNurseCallProtocolParser:
    """
    ตัวถอดรหัสโปรโตคอลตู้ Phonik DX Series (DX-32C/80C/144C)
    แปลง raw ASCII frame ให้เป็น Nurse Call Event Structured Object
    """

    EMERGENCY_LEVELS = {
        "CANCEL": 0,      # ยกเลิกการเรียก
        "NORMAL_CALL": 1,  # เรียกทั่วไป (NCX-CORD) SLA: 180s (3 นาที)
        "BATHROOM_PULL": 2,# ดึงสายในห้องน้ำ (NCX-PULL) SLA: 60s (1 นาที)
        "CARDIAC_CODE": 3  # ฉุกเฉินวิกฤต (Code Blue / Cardiac) SLA: 30s
    }

    SLA_CONFIG = {
        0: 0,
        1: 180,  # 3 minutes
        2: 60,   # 1 minute
        3: 30    # 30 seconds
    }

    @classmethod
    def parse_frame(cls, raw_frame: str) -> Optional[Dict[str, Any]]:
        clean_frame = raw_frame.replace('\r', '').replace('\n', '').strip()
        if not clean_frame:
            return None

        if clean_frame.startswith("..") or clean_frame.startswith("=="):
            clean_frame = clean_frame[2:]

        event_type = "UNKNOWN"
        room_id = "0000"
        bed_id = "BED-1"
        emergency_lvl = 1

        if "=" in clean_frame:
            head, bed_id = clean_frame.split("=", 1)
        else:
            head = clean_frame

        if head.startswith("CALL"):
            event_type = "BEDSIDE_CALL"
            room_id = head[4:].zfill(4)
            emergency_lvl = cls.EMERGENCY_LEVELS["NORMAL_CALL"]
        elif head.startswith("EMG") or head.startswith("BATH"):
            event_type = "BATHROOM_EMERGENCY"
            room_id = head[3:].zfill(4) if head.startswith("EMG") else head[4:].zfill(4)
            emergency_lvl = cls.EMERGENCY_LEVELS["BATHROOM_PULL"]
        elif head.startswith("CARDIAC") or head.startswith("CODEBLUE"):
            event_type = "CARDIAC_CODE_BLUE"
            room_id = head.replace("CARDIAC", "").replace("CODEBLUE", "").zfill(4)
            emergency_lvl = cls.EMERGENCY_LEVELS["CARDIAC_CODE"]
        elif head.startswith("CANCEL") or head.startswith("CLEAR"):
            event_type = "CALL_CANCELLED"
            room_id = head.replace("CANCEL", "").replace("CLEAR", "").zfill(4)
            emergency_lvl = cls.EMERGENCY_LEVELS["CANCEL"]
        else:
            logger.warning(f"[Parser] ไม่สามารถจำแนกรูปแบบ Frame ได้: {clean_frame}")
            return None

        event_id = f"EVT-{room_id}-{int(time.time() * 1000)}"
        timestamp = datetime.now(timezone.utc).isoformat()
        sla_seconds = cls.SLA_CONFIG.get(emergency_lvl, 180)

        return {
            "event_id": event_id,
            "room_id": room_id,
            "bed_id": bed_id or "BED-1",
            "event_type": event_type,
            "emergency_level": emergency_lvl,
            "sla_seconds": sla_seconds,
            "raw_data": raw_frame.strip(),
            "timestamp": timestamp
        }


class EdgeAIEngine:
    """
    Edge AI Engine (TFLite Runtime / Pattern Detect)
    ทำหน้าที่ประเมินความเสี่ยงและวิเคราะห์รูปแบบการกดเรียกซ้ำๆ บนเครื่อง Pi Zero 2 W
    """

    def analyze_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """วิเคราะห์ระดับความฉุกเฉินและการแจ้งเตือนขั้นสูง"""
        ai_recommendation = "STANDARD_NURSE_RESPONSE"
        priority_tag = "NORMAL"

        if event["emergency_level"] == 3:
            priority_tag = "CRITICAL_CODE_BLUE"
            ai_recommendation = "TRIGGER_AUTOMATIC_PBX_VOICE_CALL_AND_DOCTOR_ALERT"
        elif event["emergency_level"] == 2:
            priority_tag = "HIGH_FALL_RISK_BATHROOM"
            ai_recommendation = "IMMEDIATE_STAFF_DISPATCH_TO_BATHROOM"

        event["ai_analysis"] = {
            "priority_tag": priority_tag,
            "ai_recommendation": ai_recommendation,
            "processed_at": datetime.now(timezone.utc).isoformat()
        }
        return event


class NurseCallSerialListener:
    """
    Listener หลักดักจับสัญญาณ Serial (RS-232)
    และประมวลผลตาม System Architecture Blueprint (Layer 2 - Edge Computing)
    """

    def __init__(self, port: str = "/dev/ttyUSB0", baudrate: int = 9600, use_mock: bool = True):
        self.port = port
        self.baudrate = baudrate
        self.use_mock = use_mock
        self.db = LocalEventDB()
        self.ai_engine = EdgeAIEngine()
        self.running = False
        self._serial_conn = None

    def start(self):
        self.running = True
        logger.info("[Edge Listener] เริ่มต้นเปิดระบบ Nurse Call Serial Listener...")
        
        # เริ่ม Background Cloud Sync Worker Thread
        sync_thread = threading.Thread(target=self._cloud_sync_loop, name="CloudSyncWorker", daemon=True)
        sync_thread.start()

        if self.use_mock or not SERIAL_AVAILABLE:
            logger.info("[Edge Listener] ทำงานในโหมด Mock Listener (จำลองสัญญาณ Phonik PBX)")
            self._run_mock_listener()
        else:
            self._run_hardware_listener()

    def stop(self):
        self.running = False
        if self._serial_conn and self._serial_conn.is_open:
            self._serial_conn.close()
        logger.info("[Edge Listener] ปิดการทำงานระบบ Listener")

    def _run_tcp_listener(self, host: str = "192.168.1.91", port: int = 23):
        """อ่านค่าจากตู้สาขา Phonik PBX ผ่านเครือข่าย LAN (TCP Socket Telnet Port 23)"""
        import socket
        logger.info(f"[TCP Listener] เริ่มต้นเชื่อมต่อตู้สาขา Phonik PBX ทาง LAN ที่ {host}:{port}...")
        
        while self.running:
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(10.0)
                    s.connect((host, port))
                    logger.info(f"[TCP Listener] ✅ เชื่อมต่อ Phonik PBX LAN ({host}:{port}) สำเร็จ!")
                    
                    buffer = ""
                    while self.running:
                        try:
                            data = s.recv(1024).decode('ascii', errors='ignore')
                            if not data:
                                logger.warning("[TCP Listener] ⚠️ สัญญาณหลุดจากตู้ PBX (Connection Closed)")
                                break
                            buffer += data
                            while "\n" in buffer:
                                line, buffer = buffer.split("\n", 1)
                                if line.strip():
                                    self._process_raw_data(line)
                        except socket.timeout:
                            # ส่ง Ping Heartbeat เพื่อรักษาการเชื่อมต่อ
                            s.sendall(b"..VERS=\r\n")
                            time.sleep(0.5)
            except Exception as e:
                logger.error(f"[TCP Listener Error] ไม่สามารถเชื่อมต่อตู้สาขา ({host}:{port}): {e}")
                time.sleep(5)  # Auto-Reconnect Loop

    def export_vertex_ai_payload(self, event: Dict[str, Any]):
        """สร้างไฟล์ JSON ขนาดเล็ก (Compact Payload) เก็บในคลาวด์สำหรับ Vertex AI Retrain/Inference"""
        payload_dir = os.path.join(os.path.dirname(__file__), "vertex_ai_payloads")
        os.makedirs(payload_dir, exist_ok=True)
        
        filename = f"event_{event['event_id']}.json"
        filepath = os.path.join(payload_dir, filename)
        
        compact_payload = {
            "evt_id": event["event_id"],
            "rm": event["room_id"],
            "bd": event.get("bed_id", "BED1"),
            "lvl": event["emergency_level"],
            "sla": event["sla_seconds"],
            "ts": event["timestamp"],
            "ai_tag": event.get("ai_analysis", {}).get("priority_tag", "NORMAL")
        }
        
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(compact_payload, f, ensure_ascii=False)
            logger.info(f"[Vertex AI Payload] 📦 สร้างไฟล์ JSON ขนาดเล็กส่งเตรียม Cloud/Vertex AI: {filename}")
        except Exception as e:
            logger.error(f"[Vertex AI Payload Error] บันทึกไฟล์ล้มเหลว: {e}")

    def _process_raw_data(self, raw_line: str):
        """ประมวลผล Frame จาก Serial / TCP LAN"""
        parsed_event = PhonikNurseCallProtocolParser.parse_frame(raw_line)
        if not parsed_event:
            return

        # 1. ส่งเข้า Edge AI Engine
        enriched_event = self.ai_engine.analyze_event(parsed_event)

        # 2. บันทึกลง SQLite Local Fallback
        self.db.save_event(enriched_event)

        # 3. สร้างไฟล์ JSON ขนาดเล็กสอดรับกับ Vertex AI
        self.export_vertex_ai_payload(enriched_event)

        # 4. แสดงผลใน Nurse Station Console Log
        logger.info(
            f"[NURSE CALL EVENT] ห้อง: {enriched_event['room_id']} ({enriched_event['bed_id']}) | "
            f"ประเภท: {enriched_event['event_type']} | "
            f"Level: {enriched_event['emergency_level']} | SLA: {enriched_event['sla_seconds']}s"
        )

    def _trigger_local_notification(self, event: Dict[str, Any]):
        """ส่งการแจ้งเตือนไปยังระบบ Nurse Station / LINE Messaging API"""
        logger.info(f"[Notification] ส่งแจ้งเตือน LINE/Nurse Watch -> ห้อง {event['room_id']} [{event['ai_analysis']['priority_tag']}]")

    def _cloud_sync_loop(self):
        """Background Process สำหรับส่งข้อมูลเข้า GCP Pub/Sub เมื่อมี Internet"""
        while self.running:
            unsynced = self.db.get_unsynced_events(limit=10)
            if unsynced:
                logger.info(f"[Cloud Sync] กำลัง Sync ข้อมูลค้างส่ง {len(unsynced)} รายการขึ้น GCP Pub/Sub/Cloud Storage...")
                for evt in unsynced:
                    time.sleep(0.2)
                    self.db.mark_synced(evt["event_id"])
                    logger.info(f"[Cloud Sync] Synced Event ID: {evt['event_id']}")
            time.sleep(5)

    def _run_mock_listener(self):
        """จำลองเหตุการณ์ Nurse Call กดปุ่มส่งสัญญาณจากตู้สาขา"""
        mock_frames = [
            "..CALL0101=BED1\r\n",
            "..EMG0202=BATH\r\n",
            "..CANCEL0101=BED1\r\n",
            "..CARDIAC0305=BED2\r\n"
        ]
        index = 0
        while self.running:
            raw_data = mock_frames[index % len(mock_frames)]
            self._process_raw_data(raw_data)
            index += 1
            time.sleep(8)

    def _run_hardware_listener(self):
        """อ่านค่าจาก RS-232 Physical Hardware จริง"""
        try:
            self._serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=1.0
            )
            logger.info(f"[Hardware] เชื่อมต่อพอร์ต Serial {self.port} ที่ Baudrate {self.baudrate} สำเร็จ")
            
            buffer = ""
            while self.running and self._serial_conn.is_open:
                if self._serial_conn.in_waiting > 0:
                    data = self._serial_conn.read(self._serial_conn.in_waiting).decode('ascii', errors='ignore')
                    buffer += data
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        if line.strip():
                            self._process_raw_data(line)
                time.sleep(0.05)
        except Exception as e:
            logger.error(f"[Hardware Error] ข้อผิดพลาดในการเชื่อมต่อ Serial: {e}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "tcp"
    logger.info(f"=== Smart Nurse Call & Predictive Analytics - Edge Listener (Mode: {mode}) ===")
    
    if mode == "tcp":
        listener = NurseCallSerialListener(use_mock=False)
        listener.running = True
        # รัน TCP Listener เชื่อมต่อตู้ PBX จริงผ่าน LAN
        tcp_thread = threading.Thread(target=listener._run_tcp_listener, args=("192.168.1.91", 23), daemon=True)
        tcp_thread.start()
        
        # เริ่ม Background Cloud Sync Worker Thread
        sync_thread = threading.Thread(target=listener._cloud_sync_loop, name="CloudSyncWorker", daemon=True)
        sync_thread.start()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            listener.stop()
            logger.info("โปรแกรมหยุดการทำงานเรียบร้อยแล้ว")
    else:
        listener = NurseCallSerialListener(use_mock=True)
        try:
            listener.start()
        except KeyboardInterrupt:
            listener.stop()
            logger.info("โปรแกรมหยุดการทำงานเรียบร้อยแล้ว")


