# 📚 รวบรวมคำสั่งและข้อมูลอ้างอิง (Cheat Sheet)

ไฟล์นี้จัดทำขึ้นเป็นเทมเพลตและแหล่งอ้างอิง เพื่อให้คุณสามารถคัดลอกและเรียกใช้งานคำสั่งต่างๆ ได้อย่างรวดเร็ว

## 🌐 Network & SSH (Raspberry Pi)

### LAN (192.168.1.94)
```bash
ssh admin@192.168.1.94
ping 192.168.1.94 -t
```

### WiFi (pi-4 / 192.168.1.109)
```bash
ssh pi-4
ssh admin@192.168.1.109
ping 192.168.1.109 -t
# MAC: 88:a2:9e:11:07:fe
```

### WiFi-Only (pi z2w / 192.168.1.20)
```bash
ssh pi4
ssh admin@pi z2w.local
ssh admin@192.168.1.20
ping 192.168.1.20 -t
# MAC: 2c:cf:67:8e:f2:b1
```

---

## 🤖 Gemini CLI & AI Agents

**เริ่ม Gemini CLI (ใช้ npm package ของ Antigravity)**
```bash
npx @google/gemini-cli
```

**Resume Conversation**
```bash
gemini --resume "bd457f04-b6b9-447f-9ba3-3aaf75c59d9d"
```

**การเรียกใช้งานผ่านช่องทางอื่น**
- **CLI**: พิมพ์ `sync inbox` หรือ `สถานะ pi4` (ระบบจะรันให้)
- **Telegram (Pi4 bot)**: ส่ง `/inbox` หรือสั่งผ่าน SaenBarrelBot

---

## 🔑 Keys & Credentials (ข้อมูลลับ)

> [!WARNING]
> โปรดเก็บรักษาข้อมูลส่วนนี้ให้ปลอดภัย ไม่ควรนำไปเผยแพร่ใน Public Repository

**SSH Keys (SaenBarrel)**
- `SHA256:khxZ2CYOFis0lT7v4HFbJYiWa3956Mq/xQ0g2HI02cg` (Read/write)

**API Keys (Matebook)**
- `sk-or-v1-REDACTED_KEY_USE_YOUR_OWN_API_KEY`

---

## 🧠 2ndBrain & Vault Distillation

**Scripts สำหรับ MQTT & THClaws**
```bash
cd D:\2ndbrain\99_system\scripts
set MQTT_DASHBOARD_PASS=pc_d_wR9xP4zV1qYc
python ask_thclaws.py
python inject_mock_to_thclaws.py
```

**เข้าสู่โฟลเดอร์โครงการ Digital Second Brain**
```bash
cd "D:\Digital Second Brain"
```

**Prompt สำหรับ Vault Distillation** (ก็อปปี้ไปวางใน Gemini CLI ได้เลย)
> กรุณาทำ Vault Distillation โดยประมวลผลไฟล์ใหม่ทั้งหมดในโฟลเดอร์ /raw ตามขั้นตอนต่อไปนี้อย่างเคร่งครัด:
> 
> 1. [Distill]: อ่านไฟล์ .md ที่ยังไม่ได้จัดระเบียบใน /raw สกัดใจความสำคัญ แล้วสร้างเป็นไฟล์ความรู้ถาวร (Evergreen Notes) ไว้ในโฟลเดอร์ /wiki พร้อมใส่ YAML Frontmatter ให้เรียบร้อย
> 2. [Cleanup]: ย้ายไฟล์ต้นฉบับทั้งหมดที่เพิ่งอ่านจบใน /raw เข้าไปเก็บในโฟลเดอร์ย่อยที่เหมาะสม (เช่น /raw/ai-agents, /raw/hardware-iot, หรือ /raw/others) เพื่อทำความสะอาดโฟลเดอร์หลัก
> 3. [Index]: อัปเดตไฟล์ index.md โดยเพิ่มลิงก์ของไฟล์ใหม่ที่อยู่ใน /wiki เข้าไปในหมวดหมู่ที่ถูกต้อง
> 4. [Log]: บันทึกสิ่งที่ทำทั้งหมด (สรุปสั้นๆ ว่ามีไฟล์ไหนถูกย้ายหรือสร้างใหม่บ้าง) ลงใน log.md
> 
> หมายเหตุ: คุณสามารถแบ่งงานให้ Sub-agent ไปจัดการทีละส่วนแล้วส่งกลับมาแค่สรุปได้ เพื่อป้องกันประวัติแชทบวมและประหยัดโทเคน และใน wiki ให้จัดเก็บเป็นภาษาไทย

---

## 🏨 Smart Hotel PBX (ระบบปัจจุบัน)

**รัน PBX Simulator**
```bash
cd C:\Users\Nithep\Documents\antigravity\RelaySync\pbx-connector
node simulator\pbx-simulator.js --port 10001
```

**ข้อมูลการเชื่อมต่อ Phonik PBX ของจริง**
- **IP Address**: `192.168.1.91`
- **Port**: `23` (Telnet)
- **หมายเลขห้องทดสอบ**: `101`

---

## 💬 AI Agent Task Prompts (คำสั่งเรียกใช้งาน AI)

**สั่งรัน OKF (Vault Manager) เพื่อจัดระเบียบ 2ndBrain**
> 💡 *ใช้คำสั่งเหล่านี้พิมพ์บอกผม (Antigravity AI) ได้เลย ผมจะเรียกใช้ Skill ทันที*
- `ใช้ skill OKF จัดระเบียบโฟลเดอร์ /raw`
- `รัน OKF vault manager ที่ D:\Digital Second Brain`
- `ทำ Vault Distillation ไฟล์ใหม่ทั้งหมดใน /raw ด้วย OKF`

