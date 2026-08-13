# -*- coding: utf-8 -*-
"""
Module: worker/pbx_handler.py
ทำหน้าที่เป็น "ตัวแปลภาษาโปรโตคอล" (Protocol Translator) 
เพื่อแปลงคำสั่งระดับสูงของระบบเช็คอินให้กลายเป็นรหัสคำสั่ง ASCII 
ที่ตู้สาขา Phonik PBX (และบอร์ด ECS-103R) เข้าใจตามมาตรฐานโปรโตคอล Phonik
"""

class PBXProtocolHandler:
    """คลาสจัดการและสร้างชุดคำสั่งโปรโตคอล ASCII สำหรับ Phonik PBX"""

    TERMINATOR = "\r\n"
    CMD_PREFIX = ".."

    def __init__(self, room_id: str):
        """
        กำหนดค่าห้องพักเริ่มต้น
        :param room_id: เลขห้อง (เช่น "101", "0101", 101)
        """
        self.room_id = self.normalize_room(room_id)

    @staticmethod
    def normalize_room(room) -> str:
        """
        แปลงเลขห้องให้เป็นรูปแบบ 4 หลัก (Zero-padded)
        ตัวอย่าง: 101 -> "0101", "0203" -> "0203"
        """
        if room is None:
            raise ValueError("เลขห้อง (Room ID) ห้ามเป็นค่าว่าง")
        
        room_str = str(room).strip()
        if not room_str.isdigit():
            raise ValueError(f"เลขห้องไม่ถูกต้อง: '{room}' — ต้องเป็นตัวเลขเท่านั้น")
        
        return room_str.zfill(4)

    def get_power_on_command(self) -> str:
        """
        สร้างคำสั่งเปิดระบบไฟ (Check-in)
        รูปแบบ: ..ROOMxxxx=1\r\n
        """
        return f"{self.CMD_PREFIX}ROOM{self.room_id}=1{self.TERMINATOR}"

    def get_power_off_command(self) -> str:
        """
        สร้างคำสั่งปิดระบบไฟ (Check-out)
        รูปแบบ: ..ROOMxxxx=0\r\n
        """
        return f"{self.CMD_PREFIX}ROOM{self.room_id}=0{self.TERMINATOR}"

    def get_room_status_command(self) -> str:
        """
        สร้างคำสั่งอ่านสถานะระบบไฟ
        รูปแบบ: ..ROOMxxxx=\r\n
        """
        return f"{self.CMD_PREFIX}ROOM{self.room_id}={self.TERMINATOR}"

    def get_set_name_command(self, name: str) -> str:
        """
        สร้างคำสั่งบันทึกชื่อผู้เข้าพัก
        รูปแบบ: ..NAMExxxx={guest_name}\r\n
        :param name: ชื่อผู้เข้าพัก (ตัดเหลือไม่เกิน 16 ตัวอักษรตามมาตรฐานตู้สาขา)
        """
        if not name:
            raise ValueError("ชื่อผู้เข้าพักห้ามเป็นค่าว่าง")
        
        # ตัดเหลือไม่เกิน 16 ตัวอักษรและล้างช่องว่าง
        sanitized_name = name.strip()[:16]
        return f"{self.CMD_PREFIX}NAME{self.room_id}={sanitized_name}{self.TERMINATOR}"

    def get_get_name_command(self) -> str:
        """
        สร้างคำสั่งดึงชื่อผู้เข้าพักในห้อง
        รูปแบบ: ..NAMExxxx=\r\n
        """
        return f"{self.CMD_PREFIX}NAME{self.room_id}={self.TERMINATOR}"

    def get_ping_command(self) -> str:
        """
        สร้างคำสั่ง Heartbeat Ping (เช็คความพร้อมตู้สาขาโดยใช้อ่านเวอร์ชันเฟิร์มแวร์)
        รูปแบบ: ..VERS=\r\n
        """
        return f"{self.CMD_PREFIX}VERS={self.TERMINATOR}"

    def get_stop_command(self) -> str:
        """
        สร้างคำสั่งปิดการเชื่อมต่ออย่างสง่างาม
        รูปแบบ: ..STOP\r\n
        """
        return f"{self.CMD_PREFIX}STOP{self.TERMINATOR}"
