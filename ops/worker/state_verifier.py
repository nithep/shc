# -*- coding: utf-8 -*-
"""
Module: worker/state_verifier.py
ทำหน้าที่ตรวจสอบและวิเคราะห์การตอบกลับ (Response) จากตู้ Phonik PBX
เพื่อยืนยันว่าคำสั่งที่ส่งไปสำเร็จ (ACK) หรือถูกปฏิเสธ (NACK) หรือผิดปกติ (Timeout)
มีบทบาทสำคัญในระบบ Self-Healing เพื่อใช้ในการตัดสินใจทำซ้ำ (Retry)
"""

import re

class StateVerifier:
    """คลาสตรวจสอบสถานะการตอบกลับจากตู้สาขา (State Gatekeeper)"""

    RESP_PREFIX = "=="
    NACK_VALUE = "==NACK"

    @staticmethod
    def verify(raw_response: str, expected_type: str = None, expected_room: str = None) -> dict:
        """
        วิเคราะห์สายอักขระที่ตู้ PBX ตอบกลับมา
        :param raw_response: ข้อความดิบจากตู้สาขา (อาจรวม \r\n หรือ dots จาก buffer)
        :param expected_type: ประเภทที่คาดหวัง เช่น "ROOM", "NAME", "VERS"
        :param expected_room: เลขห้องที่คาดหวัง เช่น "0101"
        :return: dict ที่มีข้อมูลผลการตรวจสอบ
                 {
                    "success": bool,
                    "message": str,
                    "type": str (ROOM/NAME/VERSION/NACK/UNKNOWN),
                    "room": str or None,
                    "value": str or None
                 }
        """
        result = {
            "success": False,
            "message": "ไม่มีข้อมูลการตอบกลับ (Empty Response) หรือเชื่อมต่อล้มเหลว",
            "type": "UNKNOWN",
            "room": None,
            "value": None
        }

        if not raw_response:
            return result

        # ล้างเศษสัญลักษณ์บรรทัดและช่องว่างหน้าหลัง
        cleaned = raw_response.replace("\r", "").replace("\n", "").strip()

        # ลบจุดนำหน้า (ซึ่งตู้ PBX อาจส่งมาเป็น Prompt)
        cleaned = re.sub(r'^\.+', '', cleaned)

        # ── ตรวจพบข้อผิดพลาด NACK ──
        if cleaned == StateVerifier.NACK_VALUE or cleaned == "=NACK":
            result["success"] = False
            result["message"] = "คำสั่งถูกปฏิเสธโดยตู้สาขา (PBX NACK)"
            result["type"] = "NACK"
            return result

        # ── ตรวจสอบรูปแบบการนำหน้าด้วย == ──
        if not cleaned.startswith(StateVerifier.RESP_PREFIX):
            result["success"] = False
            result["message"] = f"รูปแบบการตอบกลับไม่ถูกต้อง (รูปแบบไม่ตรงกับ '=='): {cleaned}"
            return result

        # ตัดสัญลักษณ์ prefix ออก
        body = cleaned[len(StateVerifier.RESP_PREFIX):]

        # ── วิเคราะห์ผลกรณีคำสั่ง STOP ──
        if body == "STOP":
            result["success"] = True
            result["message"] = "ปิดการเชื่อมต่อเรียบร้อยแล้ว"
            result["type"] = "STOP"
            return result

        # ── วิเคราะห์คำตอบเวอร์ชันตู้สาขา (VERS=) ──
        if body.startswith("VERS="):
            version_val = body[5:]
            result["success"] = True
            result["message"] = f"ตรวจสอบรุ่นสำเร็จ: เวอร์ชัน {version_val}"
            result["type"] = "VERSION"
            result["value"] = version_val
            return result

        # ── วิเคราะห์คำตอบระบบไฟห้อง (ROOMxxxx=y) ──
        room_match = re.match(r"^ROOM(\d{3,4})=(\d*)$", body)
        if room_match:
            room = room_match.group(1)
            value = room_match.group(2)
            result["success"] = True
            result["type"] = "ROOM"
            result["room"] = room
            result["value"] = value
            result["message"] = f"ระบบไฟห้อง {room} อยู่ในสถานะ {value}"

            # ตรวจสอบเพิ่มเติมว่าตรงกับห้องที่ส่งไปหรือไม่
            if expected_room and room.lstrip("0") != expected_room.lstrip("0"):
                result["success"] = False
                result["message"] = f"เลขห้องไม่ตรงกัน (คาดหวัง: {expected_room}, ได้รับ: {room})"
            return result

        # ── วิเคราะห์คำตอบชื่อผู้เข้าพัก (NAMExxxx=name) ──
        name_match = re.match(r"^NAME(\d{3,4})=(.*)$", body)
        if name_match:
            room = name_match.group(1)
            name_val = name_match.group(2)
            result["success"] = True
            result["type"] = "NAME"
            result["room"] = room
            result["value"] = name_val
            result["message"] = f"ชื่อผู้เข้าพักห้อง {room} คือ {name_val}"

            if expected_room and room.lstrip("0") != expected_room.lstrip("0"):
                result["success"] = False
                result["message"] = f"เลขห้องในชื่อผู้เข้าพักไม่ตรงกัน (คาดหวัง: {expected_room})"
            return result

        # กรณีไม่ตรงกับ Pattern ใดเลย
        result["message"] = f"ไม่รู้จักเนื้อหาการตอบกลับ: {body}"
        return result
