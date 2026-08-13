# คู่มือการติดตั้งฮาร์ดแวร์ Raspberry Pi (Pi 4 และ Pi 4)

คู่มือนี้อธิบายขั้นตอนการตั้งค่าสำหรับรันระบบ Smart Hotel Self Check-in/Check-out บนฮาร์ดแวร์ Raspberry Pi ระบบนี้ถูกออกแบบมาให้รันบน **Raspberry Pi 4** (สำหรับใช้งานจริง) หรือ **Raspberry Pi 4** (สำหรับการพัฒนา/ทดสอบ)

## สิ่งที่ต้องเตรียม

- Raspberry Pi 4 หรือ Raspberry Pi 4
- MicroSD Card (แนะนำ 8GB ขึ้นไป) ที่ติดตั้ง Raspberry Pi OS (แนะนำเวอร์ชัน 32-bit หรือ 64-bit Lite สำหรับ Pi 4 เพื่อประหยัดทรัพยากร)
- การเชื่อมต่อเครือข่าย (Wi-Fi หรือ Ethernet)

## การตั้งค่าระบบและคำสั่งต่างๆ

ไม่ว่าคุณจะใช้ Pi 4 หรือ Pi 4 ขั้นตอนการตั้งค่าจะคล้ายคลึงกัน คุณสามารถ SSH เข้าไปยัง Pi ของคุณและรันคำสั่งต่อไปนี้:

### 1. อัปเดตระบบ
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. ติดตั้งเครื่องมือที่จำเป็น
สำหรับ Pi 4 การคอมไพล์จากซอร์สโค้ดอาจใช้เวลานาน จึงแนะนำให้ติดตั้งแบบ pre-built binaries เมื่อทำได้
```bash
sudo apt install -y git curl wget build-essential python3 python3-pip python3-venv
```

### 3. ติดตั้ง Node.js
สำหรับ Pi 4 (ARMv8 / ARM64):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
*หมายเหตุ: สำหรับ OS แบบ 32-bit รุ่นเก่าบน Pi 4 อาจต้องใช้ build แบบไม่เป็นทางการ หรือใช้ Node.js 18 หาก Node 20 ไม่รองรับบน ARMv7 แต่ถ้าใช้ Pi OS Bullseye/Bookworm 64-bit บน Pi 4 จะสามารถรองรับ Node 20 ได้เลย*

### 4. ติดตั้ง PM2 (ตัวจัดการโปรเซส)
PM2 ใช้สำหรับรัน Backend และ PBX Connector ไว้เบื้องหลัง และช่วยให้ระบบรีสตาร์ทตัวเองเมื่อ Pi ถูกรีบูตหรือไฟดับ
```bash
sudo npm install -g pm2
pm2 startup
```
*(ทำตามคำแนะนำที่แสดงขึ้นมาหลังจากรันคำสั่ง `pm2 startup` เพื่อตั้งค่าให้ PM2 ทำงานตอนเปิดเครื่อง)*

### 5. ตรวจสอบการติดตั้ง
```bash
echo -e "\n=== 🎯 สรุปการติดตั้ง ==="
node -v
npm -v
pm2 -v
python3 --version
git --version
echo -e "========================\n"
```

## การรันแอปพลิเคชัน

1. **Clone Repository**:
```bash
git clone <URL_of_Hotel_ECS_Checkin_project>
cd <project_folder_name>
```

2. **ติดตั้ง Dependencies**:
```bash
cd backend && npm install
cd ../frontend && npm install
cd ../pbx-connector && npm install
```

3. **เริ่มต้นระบบด้วย PM2**:
```bash
# เริ่ม Backend
cd backend
pm2 start server.js --name "hotel-backend"

# เริ่ม PBX Connector
cd ../pbx-connector
pm2 start index.js --name "pbx-connector"

# บันทึกสถานะ PM2 เพื่อให้เปิดอัตโนมัติเมื่อรีบูต
pm2 save
```

## การตั้งค่า IP Address แบบคงที่ (Static IP)
เพื่อให้แน่ใจว่า QR Code ยังใช้งานได้หลังจากไฟดับ คุณต้องกำหนด **Static IP** ให้กับ Pi (ทั้ง Pi 4 หรือ Pi 4)
วิธีที่แนะนำคือผ่าน **DHCP Reservation ของเร้าเตอร์โรงแรม** (ผูก MAC Address ของ Pi กับ IP ที่ระบุ)

อีกวิธีหนึ่งคือตั้งค่าที่ตัว Pi โดยตรง (ใช้ `nmtui` หรือแก้ไขไฟล์ `/etc/dhcpcd.conf`):
```bash
sudo nmtui
# ไปที่ 'Edit a connection', เลือก Wi-Fi/Ethernet ของคุณ แล้วเปลี่ยน IPv4 Configuration เป็น 'Manual'
# เพิ่ม IP, Gateway และ DNS ที่ต้องการ จากนั้นบันทึกและรีบูต
```
