---
title: การแก้ไขปัญหาและการกู้คืนระบบ (Troubleshooting & Recovery)
tags: [troubleshooting, bugs, fixes, logs]
type: evergreen
source: docs/troubleshooting_log.md
created: 2026-07-02
---

# การแก้ไขปัญหาและการกู้คืนระบบ (Troubleshooting & Recovery)

## 📌 ปัญหาสัญญาณ Wi-Fi ของ Raspberry Pi 4 ไม่เสถียร
- **อาการ**: SSH หลุด (Connection timed out), IP เปลี่ยนสลับระหว่างการทดสอบ (เช่น `.109` เป็น `.70`), เกิด `ERR_NETWORK_CHANGED` บนหน้าเว็บ
- **การแก้ไข**: 
  - **เปลี่ยนมาเชื่อมต่อด้วยสาย LAN (Ethernet) แทน Wi-Fi** เพื่อความเสถียรสูงสุด
  - ตั้งค่า Static IP ใน DHCP Server หรือตั้งค่าบอร์ดตรงด้วย `nmtui` เพื่อความแน่นอน

## 📌 ปัญหาตู้จำลอง PBX Simulator ไม่ได้รับสัญญาณ (Connections: 0)
- **อาการ**: หน้าเว็บสั่ง Check-in สำเร็จและขึ้นสถานะใน Frontend แต่ไฟรีเลย์จำลองบน Windows (Simulator) ไม่เปลี่ยนแปลงและขึ้น Connection เป็น 0
- **สาเหตุ**: backend รันอยู่ในโหมด `Mock` ภายในตัวเนื่องจากหาไฟล์ `.env` ที่ระบุที่อยู่ของเครื่อง Simulator ไม่พบ
- **การแก้ไข**:
  1. สร้างไฟล์ `.env` ในโฟลเดอร์ของ backend (เช่น `C:\Users\Nithep\Documents\antigravity\RelaySync\backend\.env`)
  2. ระบุค่า IP ให้ถูกต้อง:
     ```env
     PBX_MODE=tcp
     PBX_HOST=192.168.1.8
     PBX_PORT=10001
     ```
  3. สั่งรีสตาร์ทโปรเซสด้วย `pm2 restart hotel-backend` เพื่อโหลด config ใหม่

## 📌 ปัญหา NPM Conflict และ TypeScript Compiler หายบน Pi 4
- **อาการ**: `npm install` มีปัญหา ERESOLVE จากความขัดแย้งของแพ็กเกจ `@zxing` ทำให้ไม่สามารถรันตัวคอมไพเลอร์ได้
- **การแก้ไข**:
  - ใช้คำสั่ง `npm install --legacy-peer-deps` เพื่อแก้ปัญหาความไม่เข้ากันแบบเด็ดขาด
  - ตรวจสอบความถูกต้องโดยการใช้ `npm run build` อีกครั้ง

## 📌 ปัญหาระบบแจ้งเตือน Connection Lost และ EHOSTUNREACH (ตู้สาขา PBX ขาดการเชื่อมต่อ)
- **อาการ**: ระบบแจ้งเตือน System Alert: `Connection Lost` ตามด้วย `PBX Error: connect EHOSTUNREACH 192.168.1.91:23` แจ้งเตือนเข้า Telegram/Google Chat
- **สาเหตุ**: ตู้สาขา PBX ไม่ตอบสนองต่อการเชื่อมต่อ TCP หรือเครือข่ายเข้าถึงไม่ได้เลย (Host Unreachable) โดยอาจเกิดจาก:
  1. ตู้สาขา PBX ปิดอยู่ (Power off)
  2. สาย LAN ที่เชื่อมต่อตู้ PBX กับเครือข่าย/สวิตช์หลุด หรือชำรุด
  3. ตัว Raspberry Pi 4 หลุดออกจากวง LAN เดียวกันกับตู้สาขา (เช่น เกิดจากสลับวง IP หรือปัญหา Routing)
  4. IP Address ของตู้ PBX ชนกับอุปกรณ์อื่นในเครือข่าย (IP Conflict)
- **การแก้ไข (Technician Step-by-step)**:
  1. **Physical Check**: ตรวจสอบตู้ PBX Phonik และบอร์ด ECS-103R V.5 ว่าไฟแสดงสถานะการทำงาน (Power) ติดหรือไม่ และเช็คสาย LAN ฝั่งตู้ PBX และฝั่ง Pi 4 ว่าเสียบแน่นและไฟพอร์ตกระพริบหรือไม่
  2. **Network Ping Test**: ให้ลอง Ping ไปที่ IP ของตู้ PBX (เช่น `ping 192.168.1.91`) หากขึ้น `Destination Host Unreachable` แสดงว่าเครือข่ายหลุด
  3. **Port Accessibility**: ใช้คำสั่ง `telnet 192.168.1.91 23` หรือ `nc -zv 192.168.1.91 23` เพื่อเช็คว่าพอร์ต 23 เปิดอยู่หรือไม่
  4. **Self-Healing Loop**: ระบบมีฟีเจอร์ **Periodic Reconnection Loop** ทำงานอยู่เบื้องหลัง หากตู้เปิดขึ้นมาและเครือข่ายกลับมาใช้งานได้ ระบบจะใช้เวลาไม่เกิน 60 วินาทีในการกู้คืนการเชื่อมต่อ (Reconnected) อัตโนมัติ โดยไม่จำเป็นต้อง Restart Server

## 📌 ปัญหาเว็บ hotel.nithep.com ขึ้น 502 Bad Gateway (Cloudflare Tunnel — IP เปลี่ยน)
- **อาการ**: เปิด `https://hotel.nithep.com` แล้วขึ้น Error 502 Bad Gateway ทั้งๆ ที่เครื่อง Pi ยังทำงานอยู่ Ping ติด และพอร์ต 3000 เปิดอยู่
- **สาเหตุ**: Router โรงแรมแจก IP ให้ Pi 4 เปลี่ยนไปจากเดิม (DHCP Lease หมดอายุ) และ Cloudflare Tunnel ยังคงชี้ไปที่ IP เดิม เช่น `192.168.1.109:3000` แต่ Pi ได้รับ IP ใหม่เป็น `192.168.1.94:3000`
- **การแก้ไขถาวร (SOP)**:

  > **ห้ามใช้ IP Address ใน Cloudflare Tunnel โดยเด็ดขาด ให้ใช้ Docker Container Name เสมอ**

  1. ล็อกอินเข้า [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
  2. ไปที่ **Networks → Tunnels → hotel-ecs → Configure → Public Hostname**
  3. กด **Edit** ที่แถว `hotel.nithep.com`
  4. แก้ไข URL เป็น **`hotel-app:3000`** (ใช้ชื่อ Container ไม่ใช่ IP)
  5. กด **Save hostname**
  
  หรือพิมพ์คำสั่งนี้ใน Cloudflare Ask AI:
  ```
  Change the tunnel ingress rule for tunnel "hotel-ecs".
  For the public hostname "hotel.nithep.com", update the service URL to:
  http://hotel-app:3000
  ```
- **การตรวจสอบ**: รันคำสั่ง `Invoke-WebRequest -Uri "https://hotel.nithep.com/" -Method Head -UseBasicParsing` ต้องได้ `StatusCode : 200`

## 📌 ปัญหา Wi-Fi หลุดสลับและชนกันระหว่าง Cloudflare WARP และ WireGuard VPN
- **อาการ**: สัญญาณ Wi-Fi บนเครื่อง Dashboard หลุดและเชื่อมต่อใหม่บ่อยครั้ง (Disconnect/Reconnect Loop) และเมื่อพยายามเปิดหน้าจอควบคุม WireGuard GUI จะมี Error แจ้งเตือนว่า `"Manager already installed and running"`
- **สาเหตุ**:
  1. **DNS/Routing Conflict:** Cloudflare One Client (WARP) บังคับเปลี่ยน DNS ไปที่ Loopback IP (`127.0.2.2`) ในขณะที่ WireGuard VPN พยายามคุม Route และ DNS วงเครือข่ายย่อยภายใน ทำให้ DNS เกิดสับสนชั่วคราว
  2. **Windows NCSI & WiFi Reset:** Windows NCSI ตรวจเช็คอินเทอร์เน็ตล้มเหลว จึงแจ้ง "No Internet Access" และไดรเวอร์ Wi-Fi ของ Windows สั่งรีเซ็ต Adapter ตัวเองโดยอัตโนมัติเพื่อพยายามเชื่อมต่อใหม่
  3. **WireGuard UI Instance Crash:** ตัวควบคุม GUI ของ WireGuard รันค้างอยู่แบบเบื้องหลังโดยที่ไม่มีไอคอนปรากฏบนทาสก์บาร์ เมื่อผู้ใช้กดรันซ้ำระบบจึงปฏิเสธการเปิดเนื่องจากตัวเดิมค้างอยู่
- **การแก้ไขและเครื่องมืออัตโนมัติ (SOP)**:
  
  > **ต้องเปิดใช้งาน PowerShell ด้วยสิทธิ์ Run as Administrator เสมอในการแก้ไขค่าระบบเครือข่าย**
  
  1. เปิด PowerShell (Admin) และเรียกใช้งานเครื่องมือแก้ไขเครือข่ายอัตโนมัติ:
     ```powershell
     powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Nithep\ไดรฟ์ของฉัน (cnithep@gmail.com)\Hotel-ECS\scripts\network_fix.ps1"
     ```
  2. สคริปต์จะดำเนินการแก้ไข Registry บังคับใช้ `UseGlobalDNS = 1` ให้แก่ Windows NCSI, เคลียร์บริการ WireGuard ตัวที่รันค้างเพื่อสกัด Error `"Manager already installed"`, และปรับระดับ Metric ของ Wi-Fi Adapter ให้มีความสำคัญสูงสุด (Interface Metric = 10) เมื่อเทียบกับ VPN (Interface Metric = 50)
  3. **การตั้งค่าเพิ่มเติมบนคลาวด์:** เข้าแผงควบคุม Cloudflare Zero Trust Console ไปที่ **Settings -> WARP Client -> Split Tunnels (โหมด Exclude)** แล้วป้อนช่วง IP เครือข่ายเสมือนของโรงแรม (เช่น `10.0.0.0/8`, `10.0.0.0/24`) และพอร์ต UDP `51820` เพื่อขจัดปัญหาการชนกันของท่อ VPN ในระดับทราฟฟิกภายนอก

## 📌 ปัญหาอักขระภาษาไทยพังหรือกลายเป็นตัวอักษรต่างดาว (Character Encoding Mojibake)
- **อาการ**: ข้อความภาษาไทยในไฟล์เอกสาร `.md` (เช่น `project_timeline.md`) แสดงผลเป็นตัวอักษรต่างดาว เช่น `ⵤѺ...` หรือ `ⵤѺѺк...`
- **สาเหตุ**: เกิดจากสคริปต์ (Node.js/Python/PowerShell) หรือเอดิเตอร์ที่มีการอ่านและเขียนไฟล์ซ้ำโดยไม่ได้ระบุ Encoding เป็น `utf-8` แบบ Explicit ส่งผลให้ระบบไฟล์ทำการบันทึกข้อมูลด้วยระบบ Encoding อื่น (เช่น TIS-620 หรือ Windows-874)
- **การแก้ไขและป้องกัน (Enforcement Standard)**:
  1. **ฟื้นฟูข้อความ**: ใช้สคริปต์ Node.js อ่านไฟล์ด้วย `utf8` encoding และแทนที่ข้อความด้วย UTF-8 ภาษาไทยที่ถูกต้อง
  2. **กฎเหล็กใน AGENTS.md (Rule 11)**: บังคับใช้ **Strict UTF-8 Encoding Standard** ในไฟล์ `AGENTS.md` และ `.agents/AGENTS.md` ห้ามบันทึกหรือแก้ไขไฟล์เอกสาร/โค้ดภาษาไทยโดยไม่ระบุ `utf8` หรือ `fs.readFileSync(path, 'utf8')` โดยเด็ดขาด


