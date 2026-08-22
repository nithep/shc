# 🔐 Mosquitto Auth + TLS — คู่มือติดตั้ง (Hotel ECS)

ตั้งค่า MQTT Broker **Mosquitto** (ที่ติดตั้งอยู่แล้วบน Windows) ให้บังคับ **Authentication (username/password)** และเปิด **TLS (port 8883)** สำหรับระบบ Cloud-to-Edge Bridge

## 📁 ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | บทบาท |
|------|-------|
| `mosquitto.conf` | Config production (listener 1883 + 8883, auth + TLS) |
| `mosquitto-test.conf` | Config ทดสอบ (พอร์ต 1884/8884, path สัมพัทธ์) — ไม่ชน service จริง |
| `certs/server.crt` | TLS certificate (self-signed, CN=hotel.nithep.com, อายุ 825 วัน) |
| `certs/server.key` | TLS private key |
| `pwfile` | ไฟล์ username/password (Mosquitto passwd format) |
| `setup-auth-tls.ps1` | สคริปต์ติดตั้งแบบอัตโนมัติ (ต้องรันแบบ Administrator) |

## 🚀 วิธีติดตั้ง (Production)

1. เปิด **PowerShell แบบ Administrator**
2. รัน:
   ```powershell
   cd <project>\ops\mosquitto
   powershell -ExecutionPolicy Bypass -File setup-auth-tls.ps1
   ```
   - (หรือกำหนด user/pass เอง: `setup-auth-tls.ps1 -MqttUser myuser -MqttPass 'MyStr0ngPass'`)
3. สคริปต์จะ: สำรอง config เดิม → ติดตั้ง cert → สร้าง password file → ติดตั้ง config → **restart service `mosquitto`**

> ⚠️ **เปลี่ยนรหัสผ่าน default `hotel`/`HotelEcs@2026` ทันทีหลังติดตั้ง**

## 🔑 ตั้งค่า Client (Cloud + Edge)

หลังติดตั้ง ให้ใส่ค่าใน `.env` ของทั้งสองฝั่ง:

```
# ฝั่ง Cloud (api/cloudrun/.env)
MQTT_BROKER=mqtts://<broker-ip>:8883
MQTT_USER=hotel
MQTT_PASS=<รหัสผ่านของคุณ>
MQTT_TLS_REJECT_UNAUTHORIZED=false      # self-signed cert (dev/internal เท่านั้น)

# ฝั่ง Edge (ops/edge-agent/.env)
MQTT_BROKER_URL=mqtts://<broker-ip>:8883
MQTT_USERNAME=hotel
MQTT_PASSWORD=<รหัสผ่านของคุณ>
MQTT_TLS_REJECT_UNAUTHORIZED=false      # self-signed cert (dev/internal เท่านั้น)
```

- `mqtt://<broker-ip>:1883` — ใช้ภายใน LAN (มี auth แต่ไม่มี TLS)
- `mqtts://<broker-ip>:8883` — ใช้ข้าม Internet (auth + TLS)

> หมายเหตุ: `<broker-ip>` คือ IP ของเครื่องที่รัน Mosquitto (เช่น `192.168.1.x`) — ต้องตั้ง listener เป็น `0.0.0.0` แล้ว (config นี้ตั้งไว้แล้ว) เพื่อให้ Pi ใน LAN เชื่อมต่อได้

## 🔑 เปลี่ยน/เพิ่ม user

```powershell
# เพิ่ม/เปลี่ยนรหัสผ่าน (hash อัตโนมัติ)
& "C:\Program Files\Mosquitto\mosquitto_passwd.exe" -b "C:\Program Files\Mosquitto\pwfile" <username> <password>
Restart-Service mosquitto
```

## 🔒 เรื่อง Certificate (สำคัญ)

- `certs/server.crt` เป็น **self-signed** — เหมาะกับ dev/internal เท่านั้น
- Client จึงต้องตั้ง `MQTT_TLS_REJECT_UNAUTHORIZED=false` (ข้ามการตรวจ CA)
- **Production:** ใช้ cert จาก CA จริง (เช่น Let's Encrypt, โดเมน `hotel.nithep.com`) แล้ว client ปล่อย `rejectUnauthorized` เป็น default (`true`) เพื่อความปลอดภัยสูงสุด
- สร้าง self-signed ใหม่ได้ด้วย:
  ```bash
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout certs/server.key -out certs/server.crt -days 825 \
    -subj "/CN=hotel.nithep.com" \
    -addext "subjectAltName=DNS:hotel.nithep.com,DNS:localhost,IP:192.168.1.x"
  ```

## 🧪 ทดสอบโดยไม่แตะ service จริง

รัน broker แยกบนพอร์ต 1884/8884 (path สัมพัทธ์จากโฟลเดอร์นี้):

```bash
cd ops/mosquitto
"/c/Program Files/Mosquitto/mosquitto.exe" -c mosquitto-test.conf -v
```

แล้วทดสอบจาก client ด้วย `mqtts://127.0.0.1:8884` (user/pass ตาม pwfile)

## 🔗 อ้างอิง

- [[mqtt_sse_cloud_edge_bridge|สะพานเชื่อมต่อ Cloud-to-Edge แบบเรียลไทม์ (MQTT & SSE)]]

## 🛠️ การแก้ปัญหา (Troubleshooting)

- **Service start ไม่ขึ้นหลังติดตั้ง:** ตรวจ log `C:\Program Files\Mosquitto\mosquitto.log` — ถ้าเจอ `permission denied` ที่ `data\` ให้ grant write ให้ service account:
  ```powershell
  icacls "C:\Program Files\Mosquitto\data" /grant "Everyone:(OI)(CI)F" /T
  Restart-Service mosquitto
  ```
  (หรือเปลี่ยน `persistence_location` ใน config ไปยังโฟลเดอร์ที่ service เขียนได้)
- **Client ต่อ `mqtts://` ไม่ได้:** ตรวจว่าเปิดพอร์ต 8883 ใน Windows Firewall แล้ว และ client ตั้ง `MQTT_TLS_REJECT_UNAUTHORIZED=false` (สำหรับ self-signed cert)
- **Broker ถูก reject ทุกการเชื่อมต่อ:** ตรวจ `password_file` ชี้ถูกไฟล์ และ user ถูกเพิ่มด้วย `mosquitto_passwd`

- **Service start ไม่ขึ้นหลังติดตั้ง (pwfile ACL):** `mosquitto_passwd` สร้าง `pwfile` ด้วย ACL เฉพาะเจ้าของ (mode 0600) บน Windows ทำให้ service (LocalSystem) อ่านไม่ได้ — ตรวจจาก log: `password-file: Error: Unable to open pwfile`. สคริปต์ `setup-auth-tls.ps1` แก้ให้อัตโนมัติแล้ว (icacls grant `*S-1-5-18:(R)` + `*S-1-5-32-544:(R)`) แต่ถ้าแก้มือ:
  ```powershell
  icacls "C:\Program Files\Mosquitto\pwfile" /grant "*S-1-5-18:(R)" "*S-1-5-32-544:(R)"
  Restart-Service mosquitto
  ```
- **ถ้า mosquitto.log มี ACL ค้าง (อ่านไม่ได้):** grant เช่นกัน แล้ว restart:
  ```powershell
  icacls "C:\Program Files\Mosquitto\mosquitto.log" /grant "*S-1-5-18:(F)" "*S-1-5-32-544:(F)"
  ```
