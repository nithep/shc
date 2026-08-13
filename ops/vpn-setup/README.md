# 🏨 คู่มือการตั้งค่า VPN (WireGuard) และแผนการจำลองทดสอบข้ามเครือข่าย

คู่มือนี้ให้รายละเอียดการดำเนินการในระดับระบบเครือข่าย (Network Simulation Layer) สำหรับสถาปัตยกรรม **Hub-and-Spoke IoT Edge** ในระบบ **Hotel ECS Integration**

---

## 1. 🌐 การตั้งค่า Port Forwarding & Firewall (สำนักงานใหญ่ - Pi 4 Server)

ในการอนุญาตให้อุปกรณ์ลูกข่าย (Pi 4) จากภายนอกเชื่อมต่อเข้ามายังเครือข่าย VPN ของสำนักงานใหญ่ (Pi 4 Server) จำเป็นต้องตั้งค่าดังนี้:

### 1.1 การตั้งค่าบนเราเตอร์หลัก (Gateway Router)
1. เข้าสู่หน้าจัดการเราเตอร์หลักของสำนักงานใหญ่ (เช่น 192.168.1.1)
2. ไปที่เมนู **Port Forwarding** หรือ **Virtual Server**
3. สร้างกฎใหม่ (Rule) ดังนี้:
   - **Service Name**: `WireGuard-VPN`
   - **Protocol**: `UDP` (สำคัญมาก: WireGuard ใช้ UDP เท่านั้น)
   - **External Port / WAN Port**: `51820`
   - **Internal Port / LAN Port**: `51820`
   - **Internal IP Address**: ใส่ IP วงในของเราเตอร์ที่แจกจ่ายให้ Raspberry Pi 4 (เช่น `192.168.1.100` - แนะนำให้ตั้งเป็น Static IP)

### 1.2 การตั้งค่า Firewall บนตัว Raspberry Pi 4 (Server)
หากเปิดใช้งาน Firewall (UFW) บน Raspberry Pi 4 จะต้องอนุญาตให้พอร์ต UDP 51820 ผ่านเข้ามาได้:
```bash
# อนุญาตพอร์ต UDP 51820
sudo ufw allow 51820/udp

# ตรวจสอบสถานะ ufw
sudo ufw status verbose
```

เพื่อให้ Pi 4 ทำหน้าที่เป็น Gateway ส่งแพ็คเก็ตต่อได้ จะต้องเปิดใช้งาน IP Forwarding ในเคอร์เนล:
1. แก้ไขไฟล์ `/etc/sysctl.conf`:
   ```bash
   sudo nano /etc/sysctl.conf
   ```
2. ลบเครื่องหมาย `#` หน้าบรรทัดต่อไปนี้เพื่อเปิดใช้งาน:
   ```ini
   net.ipv4.ip_forward=1
   ```
3. บังคับใช้การตั้งค่าใหม่โดยไม่ต้องรีบูต:
   ```bash
   sudo sysctl -p
   ```

---

## 2. ⚙️ การตั้งค่า VPN Tunnel Health Check (ฝั่ง Pi 4 Client)

เพื่อให้ช่องสัญญาณ VPN ทะลุไฟร์วอลล์และไม่ขาดการเชื่อมต่ออย่างถาวร (ป้องกันกรณีเราเตอร์ที่สาขาตัดท่อเชื่อมต่อที่ไม่มีทราฟฟิก):
1. ย้ายสคริปต์ `vpn-healthcheck.sh` ไปยังตำแหน่งมาตรฐานและตั้งค่าสิทธิ์ให้สามารถรันได้:
   ```bash
   sudo cp vpn-healthcheck.sh /usr/local/bin/vpn-healthcheck.sh
   sudo chmod +x /usr/local/bin/vpn-healthcheck.sh
   ```
2. ลงทะเบียนใน Cron Job ของสิทธิ์ `root` เพื่อให้รันตรวจสถานะโดยอัตโนมัติทุกๆ 2 นาที:
   ```bash
   sudo crontab -e
   ```
3. เพิ่มบรรทัดด้านล่างนี้ไว้ท้ายไฟล์:
   ```cron
   */2 * * * * /usr/local/bin/vpn-healthcheck.sh > /dev/null 2>&1
   ```
4. ตรวจสอบ log การทำงานของสคริปต์ได้ที่ `/var/log/vpn-healthcheck.log`

---

## 3. 🧪 ขั้นตอนการรันจำลองการรับส่งข้อมูลข้ามเครือข่าย VPN (Testing Workflow)

เมื่อติดตั้ง WireGuard VPN เรียบร้อยแล้ว ทั้งสองเครื่องจะสื่อสารกันโดยตรงผ่าน IP:
- **Pi 4 Server**: `10.0.0.1`
- **Pi 4 Client**: `10.0.0.2`

เราจะจำลองการทำงานของระบบจองและควบคุมไฟฟ้าห้องพักจากส่วนกลางทะลุไปยังปลายทางผ่านขั้นตอนทดสอบดังนี้:

### สเต็ปที่ 1: ตรวจเช็คสถานะการเชื่อมต่อ (Ping Test)
จากบอร์ด Pi 4 (Server) ให้ลอง Ping ไปหาเครื่องลูกข่ายเพื่อยืนยันว่าท่อ VPN ทำงานแล้ว:
```bash
ping -c 4 10.0.0.2
```
*คาดหวัง: ได้รับการตอบรับ (0% packet loss) และมี Latency อยู่ในระดับยอมรับได้ (< 80ms)*

### สเต็ปที่ 2: รันตู้จำลอง PBX Simulator บน Pi 4
บน Pi 4 ให้รัน Simulator เพื่อเปิดพอร์ต TCP `10001` รอรับสัญญาณควบคุมไฟฟ้า:
```bash
cd pbx-connector
node simulator/pbx-simulator.js --port 10001
```
*คาดหวัง: หน้าจอ terminal แสดงสถานะเริ่มต้นพร้อมตารางสถานะของห้อง 101-106 และขึ้นว่า `Listening on port 10001`*

### สเต็ปที่ 3: ตั้งค่าและสตาร์ท API Server บน Pi 4
บน Pi 4 ให้รันระบบ API Backend โดยกำหนดค่าสภาพแวดล้อมชี้ไปยัง IP VPN และพอร์ตของตู้จำลองบน Pi 4:
```bash
export PBX_MODE=tcp
export PBX_HOST=10.0.0.2
export PBX_PORT=10001

cd backend
node server.js
```

### สเต็ปที่ 4: ยิงสัญญาณคำสั่งจอง (Check-in) และตรวจสอบการตอบกลับ
ทดสอบส่งคำสั่งเปิดไฟห้อง 101 โดยการส่ง HTTP POST หรือใช้ Curl จากฝั่ง Pi 4:
```bash
curl -X POST http://localhost:5000/api/checkin \
     -H "Content-Type: application/json" \
     -d '{"room": "101", "guestName": "Somchai"}'
```

**สิ่งที่ระบบจำลองและ VPN จะประมวลผล:**
1. **API Server (Pi 4)** จะรับคำสั่งจอง แล้วใช้ `pbx-connector` เพื่อเปิดการเชื่อมต่อ TCP Socket ไปยัง `10.0.0.2:10001` ผ่านท่อ WireGuard VPN
2. **CommandQueue (Pi 4)** จะทำการรับแพ็คเก็ตคำสั่งส่งสัญญาณ ASCII `..ROOM101=1\r\n` (คำสั่งเปิดไฟห้อง 101) เข้าสู่คิวการทำงาน
3. **PBX Simulator (Pi 4)** ประมวลผลคำสั่ง ปรับสถานะห้อง 101 ในหน่วยความจำเป็น ON และส่งสัญญาณยืนยันการทำรายการสำเร็จตอบกลับไปหา Pi 4 ทันทีผ่านทาง TCP Socket ด้วยรูปแบบ ASCII `=>ROOM101=1\r\n`
4. **ผลลัพธ์ที่ตรวจเช็ค**:
   - บนหน้าจอ **PBX Simulator** (Pi 4): สถานะของห้อง 101 ต้องแสดงเป็น `ON`
   - ฝั่ง **API response** (Pi 4): ต้องได้รับสถานะตอบรับสำเร็จ `status: success` และมีการบันทึกใน log ว่ายืนยันการเปิดสัญญาณเรียบร้อย
   - คิวใน `CommandQueue` ต้องทำงานเป็นลำดับแรกเข้า-ออกก่อน (FIFO) และไม่มีแพ็คเก็ตสัญญาณชนกันหรือสูญหายระหว่างทาง
