# -*- coding: utf-8 -*-
"""
Module: worker/test_pbx.py
สคริปต์จำลองการทำงานและทดสอบระบบเชื่อมต่อตู้ Phonik PBX
โดยจะทำการจำลองการส่งคำสั่ง Check-in/Check-out และประมวลผลผ่าน StateVerifier
สามารถสลับโหมดระหว่างการทดสอบผ่าน TCP Socket จริง และ Mock Data
"""

import socket
import time
import sys
from pbx_handler import PBXProtocolHandler
from state_verifier import StateVerifier

def mock_pbx_response(command: str) -> str:
    """จำลองผลการตอบกลับจากตู้สาขาตามคำสั่งที่ส่งไป"""
    cmd = command.replace("\r", "").replace("\n", "").strip()
    
    if "VERS" in cmd:
        return "==VERS=Phonik-ECS-103R V5.0\r\n"
    elif "STOP" in cmd:
        return "==STOP\r\n"
    elif "ROOM" in cmd:
        # ดึงรายละเอียดเลขห้องและสถานะ
        # ..ROOM0101=1 หรือ ..ROOM0101=0 หรือ ..ROOM0101=
        if "=" in cmd:
            parts = cmd.split("=")
            room = parts[0].replace("..ROOM", "")
            val = parts[1]
            
            # จำลอง Hardware Fault: หากเป็นห้อง 103 จะตอบ NACK ตลอดเพื่อจำลองการทำ Self-Healing
            if room == "0103":
                return "==NACK\r\n"
            
            if val == "":
                # อ่านสถานะเฉยๆ สมมติว่าเปิดอยู่
                return f"==ROOM{room}=1\r\n"
            else:
                # ตั้งค่าสำเร็จ
                return f"==ROOM{room}={val}\r\n"
        else:
            return "==NACK\r\n"
    elif "NAME" in cmd:
        if "=" in cmd:
            parts = cmd.split("=")
            room = parts[0].replace("..NAME", "")
            name = parts[1]
            if name == "":
                return f"==NAME{room}=John Doe\r\n"
            return f"==NAME{room}={name}\r\n"
        else:
            return "==NACK\r\n"
    
    return "==NACK\r\n"

def execute_with_self_healing(handler: PBXProtocolHandler, action: str, use_tcp: bool = False, host: str = "127.0.0.1", port: int = 10001, guest_name: str = None) -> bool:
    """
    ส่งคำสั่งไปยัง PBX พร้อมระบบ Self-Healing (Retry สูงสุด 3 ครั้ง)
    """
    max_retries = 3
    retry_delay = 1.0  # วินาที
    
    # ดึงคำสั่งตาม Action
    if action == "ON":
        cmd = handler.get_power_on_command()
    elif action == "OFF":
        cmd = handler.get_power_off_command()
    elif action == "SET_NAME":
        if not guest_name:
            guest_name = "Guest"
        cmd = handler.get_set_name_command(guest_name)
    elif action == "STATUS":
        cmd = handler.get_room_status_command()
    elif action == "PING":
        cmd = handler.get_ping_command()
    else:
        print(f"[ERROR] ไม่พบการสั่งการแบบ: {action}")
        return False

    print(f"\n[INIT] เตรียมส่งคำสั่งสำหรับ Action: {action} (ห้อง {handler.room_id})")
    print(f"[DATA] คำสั่งดิบที่จะส่ง: {repr(cmd)}")

    for attempt in range(1, max_retries + 1):
        print(f"[RETRY] ความพยายามครั้งที่ {attempt}/{max_retries}...")
        response = None
        
        if use_tcp:
            # ── โหมดส่งผ่าน TCP Socket จริง ──
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            client.settimeout(2.0)  # ตั้งค่า Timeout 2 วินาที
            try:
                client.connect((host, port))
                # ส่งข้อมูล
                client.sendall(cmd.encode("ascii"))
                # รับคำตอบ
                data = client.recv(1024)
                response = data.decode("ascii")
                client.close()
            except socket.timeout:
                print("[WARN] การเชื่อมต่อหมดเวลา (Socket Timeout)")
                response = ""  # จะทำให้ Verifier แจ้งเป็น Timeout
            except Exception as e:
                print(f"[WARN] ข้อผิดพลาดของ Socket: {e}")
                response = ""
        else:
            # ── โหมดจำลอง Mock ──
            # หน่วงเวลาสั้นๆ เลียนแบบเครือข่าย
            time.sleep(0.2)
            # จำลองกรณีสุ่ม Timeout ในความพยายามแรกเพื่อทดสอบระบบ Retry
            if attempt == 1 and action == "STATUS" and handler.room_id == "0104":
                print("[MOCK] จำลองสถานการณ์ Timeout สำหรับห้อง 0104")
                response = ""
            else:
                response = mock_pbx_response(cmd)

        print(f"[RESP] คำตอบจากระบบ: {repr(response)}")
        
        # ── ตรวจสอบผลลัพธ์ผ่าน Verifier ──
        verification = StateVerifier.verify(response, expected_room=handler.room_id)
        
        if verification["success"]:
            print(f"[SUCCESS] สั่งการสำเร็จ: {verification['message']}")
            return True
        else:
            print(f"[FAILED] ข้อผิดพลาด: {verification['message']}")
            # เงื่อนไขในการข้ามการ Retry: หากโดนตู้สาขาปฏิเสธ (NACK) โดยตรง
            # มักแปลว่าโครงสร้างคำสั่งผิดพลาด หรือห้องไม่มีอยู่จริง การ Retry จะไม่เกิดประโยชน์
            if verification["type"] == "NACK":
                print("[ABORT] ตู้ปฏิเสธคำสั่งตรงๆ (NACK) สิ้นสุดการทำงานเพื่อความปลอดภัย")
                break
                
            # หากเกิดปัญหาทางเครือข่าย หรือ Timeout ให้เตรียมส่งซ้ำ
            if attempt < max_retries:
                sleep_time = retry_delay * attempt  # Exponential Backoff
                print(f"[HEAL] รอประมาณ {sleep_time} วินาที ก่อนพยายามเชื่อมต่อใหม่...")
                time.sleep(sleep_time)
            else:
                print("[CRITICAL] ความพยายามส่งหมดลง ระบบควบคุมล้มเหลว")
                
    return False

def main():
    print("=" * 60)
    print("ระบบทดสอบควบคุมและวิเคราะห์สถานะตู้สาขา Phonik PBX Connector")
    print("=" * 60)
    
    # ตรวจสอบการรับอาร์กิวเมนต์ผ่าน Terminal
    use_tcp = False
    if "--tcp" in sys.argv:
        use_tcp = True
        print("[MODE] ใช้โหมดการทดสอบเชื่อมต่อ TCP Socket จริง (พอร์ต 10001)")
    else:
        print("[MODE] ใช้โหมดจำลอง (Mock Mode) - รันการทดสอบโดยไม่ต้องใช้ตู้สาขาจริง")

    # ทดสอบกรณีที่ 1: การเช็คอินและเปิดไฟห้องปกติ (ห้อง 101)
    room_101 = PBXProtocolHandler("101")
    print("\n--- ทดสอบกรณีที่ 1: เช็คอินเปิดไฟห้อง 0101 (ทำงานปกติ) ---")
    execute_with_self_healing(room_101, "ON", use_tcp=use_tcp)
    execute_with_self_healing(room_101, "SET_NAME", use_tcp=use_tcp, guest_name="Somsak Jaidee")

    # ทดสอบกรณีที่ 2: การสั่งการห้องที่มีปัญหาฮาร์ดแวร์ (ห้อง 103 ตอบ NACK เสมอ)
    room_103 = PBXProtocolHandler("103")
    print("\n--- ทดสอบกรณีที่ 2: สั่งงานห้อง 0103 ที่บอร์ดห้องมีปัญหาระบบไฟ (NACK) ---")
    execute_with_self_healing(room_103, "ON", use_tcp=use_tcp)

    # ทดสอบกรณีที่ 3: สั่งงานระบบไฟห้อง 104 โดยจำลองเกิดปัญหาเครือข่ายชั่วคราว (Timeout ในครั้งแรก)
    room_104 = PBXProtocolHandler("104")
    print("\n--- ทดสอบกรณีที่ 3: อ่านสถานะระบบไฟห้อง 0104 (จำลอง Timeout ครั้งแรกเพื่อ Self-Healing Retry) ---")
    execute_with_self_healing(room_104, "STATUS", use_tcp=use_tcp)

    print("\n" + "=" * 60)
    print("การทดสอบเสร็จสมบูรณ์")
    print("=" * 60)

if __name__ == "__main__":
    main()
