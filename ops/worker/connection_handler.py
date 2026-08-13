# -*- coding: utf-8 -*-
"""
Module: worker/connection_handler.py
ทำหน้าที่ดูแลการสื่อสารทางเครือข่าย (TCP Socket / Connection Handler)
พร้อมทั้งบรรจุเกราะป้องกันความปลอดภัย (Safety Wrapper / Constraint Enforcement)
เพื่อบล็อกคำสั่งที่อาจเป็นอันตรายต่อระบบ PBX และระบบควบคุมไฟฟ้าของโรงแรม
"""

import socket
import re

class SafetyValidationError(Exception):
    """ข้อยกเว้นเมื่อคำสั่งไม่ผ่านการตรวจสอบความปลอดภัย"""
    pass

class ConnectionHandler:
    """คลาสจัดการการเชื่อมต่อ Socket และตรวจสอบความปลอดภัยของคำสั่ง"""

    # RegEx สำหรับตรวจคำสั่งที่ได้รับอนุญาตตามมาตรฐานโปรโตคอล Phonik CCH2 เท่านั้น
    # 1. ตั้งค่า/อ่านสถานะไฟห้อง: ..ROOMxxxx=[0-3] หรือ ..ROOMxxxx=
    # 2. ตั้งค่า/อ่านชื่อแขก: ..NAMExxxx=xxxx หรือ ..NAMExxxx=
    # 3. ตรวจสอบเวอร์ชัน (Ping): ..VERS=
    # 4. ยกเลิกการเชื่อมต่อ: ..STOP
    ALLOWED_PATTERN = re.compile(
        r"^(\.\.ROOM\d{4}=[0-3]?|\.\.NAME\d{4}=.*|\.\.VERS=|\.\.STOP)$"
    )

    # รายการคำสั่งหรือคีย์เวิร์ดต้องห้ามเพื่อป้องกันความปลอดภัยขั้นสูง (Safety Constraints)
    DANGEROUS_KEYWORDS = ["RESET", "FORMAT", "DELETE", "CLEAR", "ADMIN", "CONFIG", "SHUTDOWN"]

    def __init__(self, host: str = "127.0.0.1", port: int = 10001, timeout: float = 2.0):
        self.host = host
        self.port = port
        self.timeout = timeout

    def validate_command_safety(self, command: str) -> None:
        """
        Safety Wrapper / Constraint Enforcement
        ทำการสแกนคำสั่งอย่างละเอียดก่อนยิงเข้าไปที่อุปกรณ์จริง
        """
        cleaned = command.replace("\r", "").replace("\n", "").strip()
        
        # 1. ตรวจสอบความสอดคล้องกับโปรโตคอลมาตรฐานที่ระบุไว้
        if not self.ALLOWED_PATTERN.match(cleaned):
            raise SafetyValidationError(
                f"[SAFETY BLOCK] คำสั่งมีโครงสร้างไม่ถูกต้องตามโปรโตคอลมาตรฐาน: {repr(command)}"
            )

        # 2. ตรวจสอบคำสั่งต้องห้าม (Blacklist Keywords)
        for keyword in self.DANGEROUS_KEYWORDS:
            if keyword in cleaned.upper():
                raise SafetyValidationError(
                    f"[SAFETY BLOCK] ตรวจพบคำสั่งต้องห้ามที่เป็นอันตราย: '{keyword}' ในคำสั่ง {repr(command)}"
                )

    def send_and_receive(self, command: str, use_mock: bool = False, mock_response_fn = None) -> str:
        """
        ส่งคำสั่งไปยังเครือข่ายและรอผลลัพธ์
        :param command: คำสั่ง ASCII ที่รวม \r\n แล้ว
        :param use_mock: รันในโหมด Mock หรือไม่
        :param mock_response_fn: ฟังก์ชันตอบกลับจำลองในโหมด Mock
        """
        # ขั้นแรก: เรียกผ่าน Safety Wrapper ก่อนเสมอ!
        self.validate_command_safety(command)

        if use_mock:
            if mock_response_fn:
                return mock_response_fn(command)
            return "==NACK\r\n"

        # โหมด TCP Socket จริง
        client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client.settimeout(self.timeout)
        try:
            client.connect((self.host, self.port))
            # ส่งข้อมูลแบบ ASCII bytes
            client.sendall(command.encode("ascii"))
            # รับข้อมูลตอบกลับ
            data = client.recv(1024)
            response = data.decode("ascii")
            client.close()
            return response
        except socket.timeout:
            # คืนค่าเปล่าเพื่อให้ Verifier แจ้งเป็น Timeout
            return ""
        except Exception as e:
            # แจ้งข้อผิดพลาดอื่นๆ คืนค่าเปล่า
            return ""
