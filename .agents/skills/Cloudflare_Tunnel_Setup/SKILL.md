---
name: Cloudflare_Tunnel_Setup
description: >
  มาตรฐาน SOP สำหรับการตั้งค่า Cloudflare Tunnel บนระบบ Hotel ECS
  ที่รันผ่าน Docker Compose บน Raspberry Pi 4 — ป้องกันปัญหา 502 Bad Gateway
  อันเนื่องมาจาก DHCP เปลี่ยน IP ของเครื่อง Pi โดยบังคับให้ใช้ Docker Container Name
  แทน IP Address ในทุกกรณี
---

# 🌐 Cloudflare Tunnel Setup — Hotel ECS SOP

ทักษะนี้ถูกสร้างขึ้นเพื่อป้องกันปัญหาที่เกิดซ้ำในการ Deploy ระบบ Hotel ECS
บน Raspberry Pi 4 ที่มี IP Address เปลี่ยนแปลงได้ตาม DHCP ของ Router

---

## ⚠️ กฎเหล็กที่ต้องจำ (Critical Rule)

**ห้ามใช้ IP Address ของ Pi เป็น Service URL ใน Cloudflare Tunnel โดยเด็ดขาด**

| ค่าที่ผิด (WRONG) | ค่าที่ถูก (CORRECT) |
|-------------------|---------------------|
| `http://192.168.1.94:3000` | `http://hotel-app:3000` |
| `http://192.168.1.109:3000` | `http://hotel-app:3000` |
| `http://localhost:3000` | `http://hotel-app:3000` |

---

## 🔍 สาเหตุของปัญหา (Root Cause)

เมื่อ Router แจก IP ให้ Pi ใหม่ (DHCP Lease หมดอายุ หรือ Pi บูทใหม่):
1. IP ของ Pi เปลี่ยน (เช่น `.109` → `.94`)
2. Cloudflare Tunnel ยังคงชี้ไปที่ IP เดิม
3. ไม่มีใครตอบรับที่ IP เดิม → เว็บขึ้น **502 Bad Gateway**

---

## ✅ วิธีแก้ที่ถูกต้อง (Permanent Fix)

Container `hotel-tunnel` (Cloudflare) และ `hotel-app` (Backend) รันอยู่ใน
Docker Network `hotel-ecs_default` วงเดียวกัน Docker มีระบบ Internal DNS
ที่แปลงชื่อ Container เป็น IP ภายใน Network อัตโนมัติ จึงทำงานได้โดยไม่ขึ้นกับ IP ของ Pi

### ขั้นตอนการตั้งค่า

1. ล็อกอินเข้า [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
2. ไปที่ **Networks → Tunnels** → คลิก `hotel-ecs` → **Configure**
3. ไปที่แท็บ **Public Hostname** → กด **Edit** ที่แถว `hotel.nithep.com`
4. แก้ไขฟิลด์:
   - **Type:** `HTTP`
   - **URL:** `hotel-app:3000`
5. กด **Save hostname**

### พรอมต์คำสั่งสำหรับ Cloudflare Ask AI (ก๊อบวางให้จัดการได้เลย)

**แบบที่ 1: ให้ AI ช่วยคิดชื่อและสร้างให้ (Idea & Execute)**
```text
Please help me configure the ingress rule for my Cloudflare tunnel named "hotel-ecs". 
I want to create a new public hostname to access my management frontend. My main domain is "[โดเมนของคุณ เช่น nithep.com]". 
First, suggest 3 professional subdomains for this purpose. 
Then, once I pick one, create the ingress rule using the chosen hostname. 
CRITICAL RULE: The target Service URL MUST be strictly set to "http://hotel-app:3000" (using the Docker container name) to prevent 502 Bad Gateway errors. Do not use any local IP addresses.
```

**แบบที่ 2: กำหนดชื่อเองและสั่งให้สร้างทันที (Direct Execute)**
```text
Create a new public hostname ingress rule for the Cloudflare tunnel named "hotel-ecs".
Set the public hostname to "[ชื่อที่ต้องการ เช่น operator.nithep.com]".
Set the Service Type to "HTTP".
Set the Service URL strictly to "hotel-app:3000".
Please apply these changes immediately. This configuration uses the Docker container network to prevent 502 Bad Gateway errors, so do not use any local IP addresses.
```

---

## 🧪 การตรวจสอบผล (Verification)

หลังบันทึกค่าแล้ว รอ 10-30 วินาที แล้วทดสอบ:

```powershell
# บน Windows PowerShell
Invoke-WebRequest -Uri "https://hotel.nithep.com/" -Method Head -UseBasicParsing
# ผลที่ถูกต้อง: StatusCode : 200
```

```bash
# บน Pi หรือ Linux
curl -I https://hotel.nithep.com/
# ผลที่ถูกต้อง: HTTP/2 200
```

---

## 🔑 SSH Credential มาตรฐาน

- **Username:** `ecs-agent` (สร้างโดย `bootstrap-pi.sh` — ไม่ใช่ `admin`)
- **ไฟล์กุญแจ:** `C:\Users\Nithep\.ssh\id_rsa`
- **คำสั่ง SSH:** `ssh ecs-agent@<IP_ของ_Pi>`
- **Shortcut (ผ่าน .ssh/config):** `ssh pi4` (ต้องอัปเดต HostName ในไฟล์ถ้า IP เปลี่ยน)

### วิธีเช็ค IP ปัจจุบันของ Pi (กรณี IP เปลี่ยน)
```powershell
# สแกนหา Pi จาก MAC Address: 88:a2:9e:11:07:fd
arp -a | findstr "88-a2-9e-11-07-fd"
```

---

## 📋 Checklist ก่อน Go-Live ทุกครั้ง

- [ ] Cloudflare Tunnel ชี้ไปที่ `hotel-app:3000` (ไม่ใช่ IP)
- [ ] เว็บ `https://hotel.nithep.com` ตอบ `200 OK`
- [ ] `docker ps` บน Pi แสดง `hotel-tunnel` และ `hotel-app` สถานะ `Up`
- [ ] SSH ด้วย `ssh ecs-agent@<IP>` เข้าได้สำเร็จ
- [ ] Heartbeat PBX แสดง `[PBX] 💓 Heartbeat OK` ใน docker logs
