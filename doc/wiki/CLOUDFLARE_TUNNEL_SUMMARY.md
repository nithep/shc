# 🌐 คู่มือการกำหนดค่าและรักษาเสถียรภาพ Cloudflare Tunnel (SNC Cloudflare Tunnel Summary)

เอกสารนี้สรุปมาตรฐานขั้นตอนปฏิบัติงาน (SOP) ในการกำหนดค่าและดูแลความเชื่อมโยงระบบ **Cloudflare Tunnel** สำหรับระบบ **Smart Nurse Call (SNC) PoC** บนบอร์ด Raspberry Pi 4 เพื่อป้องกันปัญหาการเข้าถึงระบบไม่ได้เนื่องจากเราเตอร์เปลี่ยนหมายเลข IP ด้วย DHCP (ป้องกันปัญหา 502 Bad Gateway อย่างถาวร)

---

## ⚠️ กฎเหล็กว่าด้วยการหลีกเลี่ยง IP วงแลนเชิงกายภาพ (The Immutable Rule)

> [!IMPORTANT]
> **ห้ามใช้หมายเลข IP เครือข่ายภายใน (LAN IP เช่น `192.168.1.x`) ในการระบุเป็นต้นทางส่งข้อมูล (Service URL) ของ Cloudflare Ingress Rule โดยเด็ดขาด**

เมื่อใดก็ตามที่เราเตอร์ทำการรีบูต หรือสัญญาเช่า IP (DHCP Lease) ของบอร์ด Pi หมดลง หมายเลข IP ของ Pi อาจมีการแปรผันจาก `.94` ไปเป็น `.109` หรือหมายเลขอื่นๆ หากตัวแทนการแลกเปลี่ยนเครือข่ายของ Cloudflare ยังคงส่งข้อมูลไปที่ IP ตัวเดิม จะส่งผลให้หน้าต่างแสดงสถานะตอบกลับด้วยข้อผิดพลาด **502 Bad Gateway** ทันที

---

## 🛠️ โครงสร้างสถาปัตยกรรมทางเลือกและการกำหนดค่า (Ingress Topology Choices)

ทีมวิศวกรสามารถเลือกสถาปัตยกรรมการเชื่อมโยงภายนอก (Ingress) ตามระบบการ Deploy ตัว Cloudflare Tunnel บนบอร์ด Pi ได้ตามความเหมาะสม ดังนี้:

### ทางเลือกที่ A: รัน Cloudflare Tunnel เป็น Systemd Service บน Pi โดยตรง (แนะนำสูงสุด ⭐)
หากรัน Cloudflare daemon (`cloudflared`) เป็นบริการของระบบปฎิบัติการระดับ Host การชี้เป้าหมายกลับเข้ามาที่ API Server จะมีความคงทนสูงที่สุด:

* **การคอนฟิกบน Cloudflare Zero Trust Dashboard:**
  * **Public Hostname:** `nursecall.nithep.com` (หรือโดเมนย่อยที่ได้รับมอบหมาย)
  * **Service Type:** `HTTP`
  * **Service URL:** `http://localhost:8000` หรือ `http://127.0.0.1:8000`

> [!TIP]
> **ทำไมทางเลือกนี้ถึงเสถียรที่สุด?** 
> เนื่องจาก `localhost` เป็น Loopback interface ภายในระบบปฏิบัติการ Host เสมอ ไม่ว่า IP ของสาย LAN หรือ Wi-Fi ของ Pi จะแปรผันไปอย่างไร Loopback จะชี้มาที่ Backend API Port 8000 ได้อย่างไร้ข้อผิดพลาดและมีความปลอดภัยสูงกว่าการเปิดเผยพอร์ตสู่เครือข่ายวงกว้าง

---

### ทางเลือกที่ B: รัน Cloudflare Tunnel ผ่าน Docker Container
หากรัน `cloudflared` ภายใน Docker Container ในขณะที่ระบบ Backend รันเป็น Systemd Service ในเครื่อง Host การเรียกหา `localhost:8000` จากใน Container จะไม่เจอบริการ (เพราะจะมองหาในลูปแบ็กของ Container ตัวเอง):

* **แนวทางการกำหนดค่าที่ถูกต้อง:**
  * **วิธีที่ 1 (Docker Host Network):** รัน Container ของ Cloudflared ด้วยคำสั่ง `--network host` จากนั้นจะสามารถชี้ Service URL ไปที่ `http://localhost:8000` ได้ทันที
  * **วิธีที่ 2 (Docker Bridge Gateway):** ชี้ URL ไปที่ตำแหน่ง IP เกตเวย์ของระบบ Docker Bridge (ซึ่งมักจะเป็นค่าคงที่เสมอ) เช่น `http://172.17.0.1:8000`
  * **วิธีที่ 3 (DNS Address):** ใช้คุณสมบัติ `--add-host=host.docker.internal:host-gateway` และกำหนด URL ใน Cloudflare Dashboard เป็น `http://host.docker.internal:8000`

---

## 📋 แผนภูมิการไหลของข้อมูลและการรักษาความปลอดภัย (Data Flow & Security)

```
┌──────────────────────────────────────┐             ┌─────────────────────────────────────┐
│       โลกภายนอก (Public Internet)     │             │     สภาพแวดล้อม Pi 4 (Private Host)  │
│                                      │             │                                     │
│  ┌────────────────┐  HTTPS / TLS     │             │  ┌───────────────┐                  │
│  │ ผู้ใช้งานภายนอก │─────────────────┼────────────┼─▶│  cloudflared  │                  │
│  │ (Web Dashboard)│                  │             │  │ Daemon (Host) │                  │
│  └────────────────┘                  │             │  └───────┬───────┘                  │
│                                      │             │          │ HTTP (Loopback Tunnel)   │
│                                      │             │          ▼                          │
│                                      │             │  ┌───────────────┐                  │
│                                      │             │  │  SNC Backend  │                  │
│                                      │             │  │  (Port 8000)  │                  │
│                                      │             │  └───────────────┘                  │
└──────────────────────────────────────┘             └─────────────────────────────────────┘
```

* **สถาปัตยกรรมความปลอดภัย (Zero Open Ports):** ระบบจะไม่มีการเปิดพอร์ตขาเข้า (Inbound Port Forwarding) บนเราเตอร์ของโรงแรมเลย ตัวแทน `cloudflared` จะเป็นผู้สร้างอุโมงค์เชื่อมต่อขาออก (Outbound TCP/QUIC Connection) ไปยังเครือข่ายของ Cloudflare เอง ทำให้มีความปลอดภัยจากการโจมตีภายนอก 100%

---

## 🧪 ขั้นตอนตรวจสอบความสมบูรณ์หลังการติดตั้ง (Go-Live Connection Verification)

หลังจากการคอนฟิก Ingress Rule บนระบบ Cloudflare Dashboard เรียบร้อยแล้ว ให้รอประมาณ 15-30 วินาที เพื่อให้อุโมงค์เครือข่ายอัปเดตข้อมูล จากนั้นให้ทดสอบด้วยคำสั่งดังต่อไปนี้:

### 1. ทดสอบตรวจดูส่วนหัวของการส่งตอบกลับ (Header Verification)
```powershell
# รันบนเครื่องของวิศวกรผู้พัฒนา (Windows PowerShell)
Invoke-WebRequest -Uri "https://hotel.nithep.com/dashboard-status.html" -Method Head -UseBasicParsing
```
หรือบนบอร์ด Pi:
```bash
curl -I https://hotel.nithep.com/dashboard-status.html
```
> **เกณฑ์ผ่าน:** จะต้องได้รับค่าตอบกลับการเชื่อมต่อเป็นแบบ **`HTTP/2 200`** หรือ **`HTTP/1.1 200 OK`** เท่านั้น (ไม่ใช่ 502 หรือ 504)

### 2. ตรวจสอบการรับส่งข้อมูลจริงผ่าน API
ทดลองดึงข้อมูลประวัติกิจกรรมล่าสุดผ่านอุโมงค์สาธารณะ:
```bash
curl -H "X-API-Key: [SNC_API_KEY_ที่ตั้งไว้]" https://hotel.nithep.com/api/events
```

---

## 📝 บันทึกประวัติการปรับปรุง
* **v1.0.0 (2026-08-11):** บันทึกมาตรฐานปฏิบัติงาน SOP เพื่อเป็นเกณฑ์การป้องกันข้อผิดพลาด 502 Bad Gateway สำหรับสถาปัตยกรรม SNC PoC ที่บูรณาการร่วมกับระบบควบคุมหลัก
