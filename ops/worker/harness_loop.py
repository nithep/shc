# -*- coding: utf-8 -*-
"""
Module: worker/harness_loop.py
ศูนย์กลางการประมวลผลลูปการทำงานหลัก (Harness Closed-Loop Core)
ขับเคลื่อนกระบวนการด้วยระบบ 4 ขั้นตอน: PLAN -> DO -> VERIFY -> DECIDE
และติดตั้ง Telemetry Logger เพื่อสกัดข้อมูลวิเคราะห์การตัดสินใจของระบบย้อนหลัง
"""

import time
import sys
import logging
from pbx_handler import PBXProtocolHandler
from state_verifier import StateVerifier
from connection_handler import ConnectionHandler, SafetyValidationError

# ── ตั้งค่า Telemetry Logger (Observability) ──
# บันทึกประวัติการตัดสินใจ Traces ลงทั้งหน้าจอและไฟล์ log
telemetry_formatter = logging.Formatter(
    '[TELEMETRY] %(asctime)s - %(levelname)s - %(message)s'
)

# บันทึกไฟล์
file_handler = logging.FileHandler('worker/harness_telemetry.log', encoding='utf-8')
file_handler.setFormatter(telemetry_formatter)

# บันทึกออก console
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(telemetry_formatter)

telemetry = logging.getLogger('HarnessTelemetry')
telemetry.setLevel(logging.INFO)
telemetry.addHandler(file_handler)
telemetry.addHandler(console_handler)

# ลบ default handlers เพื่อไม่ให้ log ซ้ำซ้อน
logging.getLogger().handlers = []


# ── ฟังก์ชันจำลองผลการตอบกลับจากตู้สาขา (Mock PBX) ──
def mock_pbx_response(command: str) -> str:
    cmd = command.replace("\r", "").replace("\n", "").strip()
    
    if "VERS" in cmd:
        return "==VERS=Phonik-ECS-103R V5.0\r\n"
    elif "STOP" in cmd:
        return "==STOP\r\n"
    elif "ROOM" in cmd:
        if "=" in cmd:
            parts = cmd.split("=")
            room = parts[0].replace("..ROOM", "")
            val = parts[1]
            if room == "0103":
                # จำลองบอร์ดห้อง 103 มีปัญหา จะตอบ NACK
                return "==NACK\r\n"
            return f"==ROOM{room}={val}\r\n"
    elif "NAME" in cmd:
        if "=" in cmd:
            parts = cmd.split("=")
            room = parts[0].replace("..NAME", "")
            name = parts[1]
            return f"==NAME{room}={name}\r\n"
    return "==NACK\r\n"


# ── ระบบขับเคลื่อน Harness Loop ──
class AgenticHarness:
    """แกนหลักที่ทำหน้าที่รัน Closed-loop และประเมินผลการตัดสินใจ"""

    def __init__(self, room_id: str, use_tcp: bool = False, host: str = "127.0.0.1", port: int = 10001):
        self.room_id = room_id
        self.use_tcp = use_tcp
        self.pbx_handler = PBXProtocolHandler(room_id)
        self.connection = ConnectionHandler(host, port)
        self.max_retries = 3
        self.retry_delay = 1.0

    def run_action(self, action: str, param: str = None) -> bool:
        """
        ทำงานตาม Action ที่ได้รับมอบหมายตามลูป PLAN-DO-VERIFY-DECIDE
        """
        telemetry.info(f"เริ่มต้นภารกิจควบคุมห้อง {self.pbx_handler.room_id} -> Action: {action}")

        # 🚀 1. PLAN (วางขั้นตอนและเตรียมความพร้อม)
        telemetry.info("[STAGE: PLAN] กำลังเตรียมโครงสร้างชุดคำสั่ง...")
        try:
            if action == "ON":
                cmd = self.pbx_handler.get_power_on_command()
            elif action == "OFF":
                cmd = self.pbx_handler.get_power_off_command()
            elif action == "SET_NAME":
                if not param:
                    raise ValueError("การบันทึกชื่อผู้เข้าพักต้องการพารามิเตอร์ชื่อ")
                cmd = self.pbx_handler.get_set_name_command(param)
            elif action == "STATUS":
                cmd = self.pbx_handler.get_room_status_command()
            elif action == "DANGEROUS_TEST":
                # สำหรับจำลองการสั่งงานต้องห้ามเพื่อทดสอบ Safety Wrapper
                cmd = "..VERS=RESET\r\n"
            else:
                telemetry.error(f"[DECISION] ยกเลิกภารกิจ: ไม่รู้จักคำสั่ง '{action}'")
                return False
            telemetry.info(f"[PLAN SUCCESS] สร้างชุดคำสั่งสำเร็จ: {repr(cmd)}")
        except Exception as e:
            telemetry.error(f"[PLAN FAILED] ล้มเหลวในขั้นตอนวางแผน: {e}")
            return False

        # 🚀 2. DO (ส่งคำสั่ง) & 🚀 3. VERIFY (ยืนยันผลลัพธ์)
        for attempt in range(1, self.max_retries + 1):
            telemetry.info(f"[STAGE: DO] ส่งคำสั่งไปยังตู้สาขา (ครั้งที่ {attempt}/{self.max_retries})")
            response = None
            
            try:
                # ส่งผ่าน Connection Handler ที่มี Safety Wrapper
                if self.use_tcp:
                    response = self.connection.send_and_receive(cmd, use_mock=False)
                else:
                    # หน่วงเวลาสั้นๆ
                    time.sleep(0.1)
                    # จำลองกรณีสุ่ม Timeout ในความพยายามครั้งแรกของห้อง 104
                    if attempt == 1 and action == "STATUS" and self.pbx_handler.room_id == "0104":
                        telemetry.warning("[MOCK NETWORK] จำลองสถานการณ์ Timeout เครือข่ายขัดข้อง")
                        response = ""  # ส่งผลให้เกิด Timeout
                    else:
                        response = self.connection.send_and_receive(
                            cmd, use_mock=True, mock_response_fn=mock_pbx_response
                        )
                
                telemetry.info(f"[DO SUCCESS] ได้รับการตอบสนองดิบ: {repr(response)}")
                
            except SafetyValidationError as sve:
                # 🚀 4. DECIDE (การประเมินความปลอดภัย)
                telemetry.critical(f"[STAGE: DECIDE] [SAFETY BLOCK] ตรวจพบคำสั่งไม่สอดคล้องกับขอบเขตความปลอดภัย: {sve}")
                telemetry.info("[DECISION] ปฏิเสธการส่งข้อมูลและยกเลิกลูปทันทีเพื่อความปลอดภัยสูงสุด")
                return False
            except Exception as e:
                telemetry.error(f"[DO FAILED] ข้อผิดพลาดทางระบบเชื่อมต่อ: {e}")
                response = ""

            # 🚀 3. VERIFY (ประเมินความถูกต้อง)
            telemetry.info("[STAGE: VERIFY] กำลังวิเคราะห์สัญญาณตอบกลับ...")
            verification = StateVerifier.verify(response, expected_room=self.pbx_handler.room_id)
            
            # 🚀 4. DECIDE (การตัดสินใจทางธุรกิจและ Self-Healing)
            if verification["success"]:
                telemetry.info(f"[STAGE: DECIDE] [VERIFY SUCCESS] ผลลัพธ์ถูกต้อง: {verification['message']}")
                telemetry.info("[DECISION] ภารกิจเสร็จสิ้นตามเป้าหมาย (Success) - ปิดรอบ")
                return True
            else:
                telemetry.warning(f"[STAGE: DECIDE] [VERIFY FAILED] ผลลัพธ์ไม่ตรงตามเป้าหมาย: {verification['message']}")
                
                # ถ้าโดนบอร์ดหรือตู้สาขาปฏิเสธ (NACK) ตรงๆ บ่งบอกว่า Hardware/Command ผิดปกติ ไม่ควร Retry
                if verification["type"] == "NACK":
                    telemetry.error("[DECISION] ปฏิเสธโดยตู้สาขา (NACK) - ยกเลิกลูป (Abort Retry) เพื่อป้องกันปัญหาระบบควบคุม")
                    break
                
                # หากเกิด Timeout/ข้อมูลว่าง ให้ทำตามกระบวนการ Self-Healing
                if attempt < self.max_retries:
                    sleep_time = self.retry_delay * attempt  # Exponential Backoff
                    telemetry.info(f"[HEAL] เริ่มกระบวนการฟื้นฟูระบบ: รอ {sleep_time} วินาที ก่อนพยายามส่งใหม่...")
                    time.sleep(sleep_time)
                else:
                    telemetry.critical("[DECISION] ความพยายามสูงสุดหมดลงแล้ว ระบบล้มเหลวโดยสิ้นเชิง (Critical Failure)")
        
        return False


def main():
    telemetry.info("=" * 65)
    telemetry.info("เริ่มต้นระบบทดสอบปิดลูปข้อมูล (Closed-Loop Harness Environment)")
    telemetry.info("=" * 65)

    use_tcp = "--tcp" in sys.argv
    if use_tcp:
        telemetry.info("โหมด: ส่งข้อมูล Socket เครือข่ายจริง (พอร์ต 10001)")
    else:
        telemetry.info("โหมด: การจำลองสภาพแวดล้อม (Mock Sandbox)")

    # Test Case 1: การเปิดระบบไฟฟ้าห้องปกติ (ห้อง 101)
    harness_101 = AgenticHarness("101", use_tcp=use_tcp)
    harness_101.run_action("ON")
    harness_101.run_action("SET_NAME", "Somsak Jaidee")

    # Test Case 2: การเปิดระบบไฟฟ้าห้องที่มีปัญหาทางกายภาพ (ห้อง 103 ตอบ NACK)
    harness_103 = AgenticHarness("103", use_tcp=use_tcp)
    harness_103.run_action("ON")

    # Test Case 3: การสั่งงานที่เจอปัญหา Timeout ในครั้งแรก (ห้อง 104)
    harness_104 = AgenticHarness("104", use_tcp=use_tcp)
    harness_104.run_action("STATUS")

    # Test Case 4: การทดสอบกลไกป้องกันคำสั่งอันตราย (Safety Wrapper / Constraint Enforcement)
    telemetry.info("\n--- ทดสอบระบบความปลอดภัยระดับสถาปัตยกรรม (Safety Wrapper Test) ---")
    harness_safety = AgenticHarness("101", use_tcp=use_tcp)
    harness_safety.run_action("DANGEROUS_TEST")

    telemetry.info("=" * 65)
    telemetry.info("การรันระบบทดสอบ Harness Loop เสร็จสิ้น")
    telemetry.info("=" * 65)

if __name__ == "__main__":
    main()
