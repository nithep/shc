# การแก้ไขปัญหา SNC Listener ↔ Phonik PBX (192.168.1.91:23)

**วันที่:** 2026-08-11
**สถานะ:** ปัญหาผ่านไปชั่วคราว (reconnect สำเร็จ 18:08) — ต้องเฝ้าระวังถ้าเกิดซ้ำ

## อาการ

- `snc-pbx-listener.service` log ซ้ำทุก 5 วินาที:
  `Error in PBX Telnet listener: [Errno 111] Connect call failed ('192.168.1.91', 23). Retrying in 5 seconds...`
- เริ่ม **17:18** (หลัง Pi reboot) ต่อเนื่องถึง **18:08** (~50 นาที)
- จาก PC (`192.168.1.46`) ก็ `Connection refused` เหมือนกัน → **ไม่ใช่ปัญหาเฉพาะ Pi**

## หลักฐานที่ตรวจ (2026-08-11)

| ตรวจ | ผล |
|---|---|
| `ping 192.168.1.91` (PC + Pi) | ผ่าน — ตู้ยังอยู่ |
| ARP MAC ของ .91 | `00-1f-57-01-17-8e` (ตรงกับช่วงเช้า) |
| TCP :23 | **`Connection refused` (RST)** — ไม่ใช่ timeout → มีอะไรที่ .91 ปฏิเสธ telnet |
| `ip route get 192.168.1.91` (Pi) | `dev eth0 src 192.168.1.94` ✅ เส้นทางถูก |
| ping Pi→PBX | ผ่าน แต่ latency **112–174ms** (LAN ปกติ <1ms — ตู้ตอบ ICMP ช้า) |
| หลัง restart listener (18:08) | `PBX authentication & SMDR subscription handshake completed` + `Connected successfully to Phonik PBX!` ✅ |

## สาเหตุที่เป็นไปได้ (เรียงตามโอกาส)

1. **Telnet session เดียวถูกครอบ** — ตู้ Phonik รับ telnet ได้ session เดียว; ถ้า PC Operator / เครื่องอื่นเปิด session ค้าง → ตู้ปฏิเสธ session ใหม่ (`Errno 111`) จนกว่า session นั้นจะหลุด (น่าจะเป็นกรณีนี้ — หลุดช่วง 17:18–18:08 แล้วคืนมาเอง)
2. **ตู้สะดุด/รีเซ็ตชั่วคราว** — ตรงกับช่วงหลัง Pi reboot ต่อเนื่อง
3. **SMDR Target IP Lock** — อ้างอิง `snc-poc/docs/snc_analysis_report.md`: ตู้อาจปิด SMDR เป็นค่าเริ่มต้น หรือ **ล็อก IP ปลายทาง** ที่อนุญาต — ต้องมี `192.168.1.94` (Pi) ในรายการ (ถ้า "Connected แต่ไม่มีข้อมูลไหล" → ตรวจข้อนี้)

## ขั้นตอนตรวจที่ตู้ (ต้องไปหน้างาน / ใช้ PC Operator)

1. ปิด/ปลด session telnet ที่ค้างไว้ (PC Operator หรือเทอร์มินัลเปิดค้าง)
2. ตรวจ SMDR Output: เปิดใช้งาน + Target IP = `192.168.1.94`
3. ตรวจ log ของตู้ช่วง 17:18–18:08

## วิธี verify

```bash
tail -f /home/ecs-agent/snc-poc/pbx_listener.log   # ควรเห็น "Connected successfully to Phonik PBX!"
telnet 192.168.1.91 23                              # ทดสอบตรง (แล้วกด Ctrl+] แล้ว q เพื่อออก)
```

## หมายเหตุ

- ระบบเชื่อมต่อตู้ผ่าน SMDR `==SMDX` / `--SMDX` บน port 23 — รายละเอียดใน `snc-poc/docs/snc_analysis_report.md`
- ถ้าปัญหาเกิดซ้ำ ให้เช็คข้อ 1 ก่อน (session ค้าง = สาเหตุพบบ่อยสุด)
- Listener อ่าน `PBX_PASS` จาก `pbx-connector/.env` (ไฟล์นี้มี SNC_API_KEY + ช่อง PBX_PASS ให้เติม)
