# 🚀 Hotfix Deployment Guide: Deadlock & Black Screen Prevention

## Overview
คู่มือการติดตั้งแก้ไขวิกฤต 2 จุดที่ทำให้ระบบค้างและหน้าจอมืดใน Hotel ECS Project

**วันที่:** 2026-07-20  
**เวอร์ชัน:** 1.0  
**สถานะ:** ✅ Tested & Ready for Production

---

## 📋 สิ่งที่ได้รับการแก้ไข

### 1. Backend Queue Deadlock Prevention
- **ไฟล์:** `pbx-connector/queue.js`
- **ปัญหา:** คิวฮาร์ดแวร์ล็อกถาวรเมื่อ PBX ไม่ตอบสนอง
- **วิธีแก้:** เพิ่ม Safety Timeout Gate ด้วย `Promise.race()` จำกัดเวลา 5,000ms

### 2. Frontend Premium Error Boundary
- **ไฟล์ใหม่:** `frontend/src/components/PremiumErrorBoundary.tsx`
- **ไฟล์แก้ไข:** `frontend/src/main.tsx`
- **ปัญหา:** หน้าจอมืดเมื่อเกิด Uncaught Runtime Errors
- **วิธีแก้:** สร้าง Error Boundary ดักจับข้อผิดพลาดพร้อม UI แบบพรีเมียม

---

## 🔧 ขั้นตอนการติดตั้งบน Raspberry Pi 4

### STEP 1: เคลียร์และติดตั้งสิทธิ์ระดับ OS

```bash
cd hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea
chmod +x scripts/setup_pi4.sh
sudo ./scripts/setup_pi4.sh
sudo reboot
```

### STEP 2: ล้าง Cache และคอมไพล์ Native Dependencies ใหม่ทั้งหมด

```bash
cd ~/hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea

# ล้าง Backend dependencies
cd backend && rm -rf node_modules package-lock.json && npm install

# ล้าง Frontend dependencies
cd ../frontend && rm -rf node_modules package-lock.json && npm install
```

### STEP 3: ทดสอบการทำงานของ Queue Timeout Protection

```bash
cd ~/hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea/pbx-connector
node test_queue_timeout.js
```

**ผลลัพธ์ที่คาดหวัง:**
```
🧪 Testing Queue Safety Timeout Protection...

Test 1: Normal command execution...
✅ Test 1 PASSED: Normal command completed - SUCCESS

Test 2: Slow command timeout protection...
[QUEUE ERROR] Safety Gate Triggered: HARDWARE_TIMEOUT: Phonik PBX failed to respond within 5s
✅ Test 2 PASSED: Timeout triggered after ~5000ms

Test 3: Queue recovery after timeout...
✅ Test 3 PASSED: Queue recovered and processed next command - RECOVERED

🎉 All tests completed!
```

### STEP 4: เริ่มการทำงานระบบในโหมดตรวจสอบข้อผิดพลาดระดับลึก

#### Terminal 1 - ฝั่งควบคุมฮาร์ดแวร์ PBX
```bash
cd ~/hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea/backend
DEBUG=pbx:* NODE_ENV=production node server.js
```

**สิ่งที่ต้องสังเกต:**
- หาก PBX ไม่ตอบสนอง จะเห็น log: `[QUEUE ERROR] Safety Gate Triggered: HARDWARE_TIMEOUT...`
- ระบบจะ Retry อัตโนมัติโดยไม่ทำให้คิวแช่แข็ง

#### Terminal 2 - ฝั่งส่วนติดต่อผู้ใช้งานพรีเมียม UI
```bash
cd ~/hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea/frontend
npm run dev -- --host
```

**สิ่งที่ต้องทดสอบ:**
1. เปิดเบราว์เซอร์เข้า `http://<PI4_IP>:5173`
2. บังคับให้เกิด Error (เช่น ปิด Backend แล้วลองโหลดหน้า)
3. ควรเห็น Premium Error UI แทนหน้าจอมืด
4. กดปุ่ม "รีโหลดหน้าจอ" แล้วระบบควรกลับมาทำงานปกติ

---

## ✅ การตรวจสอบความถูกต้อง (Verification Checklist)

### Backend Verification
- [ ] ไฟล์ `pbx-connector/queue.js` มีฟังก์ชัน `executeHardwareCommand`
- [ ] รัน `test_queue_timeout.js` แล้วผ่านทั้ง 3 Tests
- [ ] Log แสดง `[QUEUE ERROR] Safety Gate Triggered` เมื่อ PBX timeout
- [ ] คิวสามารถรับคำสั่งถัดไปได้หลัง timeout (ไม่ deadlock)

### Frontend Verification
- [ ] ไฟล์ `frontend/src/components/PremiumErrorBoundary.tsx` ถูกสร้างแล้ว
- [ ] ไฟล์ `frontend/src/main.tsx` Wrap `<App />` ด้วย `<PremiumErrorBoundary>`
- [ ] Build สำเร็จไม่มี error (`npm run build`)
- [ ] เมื่อบังคับให้เกิด Error จะเห็น Premium Error UI (ไม่ใช่หน้าจอมืด)
- [ ] ปุ่ม "รีโหลดหน้าจอ" ทำงานได้และกู้คืนระบบ

### Documentation Verification
- [ ] ไฟล์ `docs/wiki/deadlock_prevention.md` ถูกสร้างแล้ว
- [ ] ไฟล์ `docs/wiki/project_timeline.md` มี entry ใหม่ "[Hotfix] Resolved Hardware Deadlock..."

---

## 🐛 Troubleshooting

### ปัญหา: Timeout เกิดบ่อยเกินไป (>10 ครั้ง/ชั่วโมง)

**อาการ:**
```
[QUEUE ERROR] Safety Gate Triggered: HARDWARE_TIMEOUT: Phonik PBX failed to respond within 5s
```

**วิธีแก้:**
1. ตรวจสอบสาย LAN ระหว่าง Pi4 กับตู้สาขา PBX
2. ตรวจสอบว่า PBX Simulator รันอยู่หรือไม่ (ถ้าใช้โหมดจำลอง)
3. เพิ่ม Timeout เป็น 8000ms ใน `queue.js` (บรรทัดที่ wrap asyncFn)

```javascript
const wrappedAsyncFn = () => executeHardwareCommand(asyncFn, 8000); // เพิ่มเป็น 8 วินาที
```

### ปัญหา: Error Boundary ไม่แสดง UI

**อาการ:**
- ยังเห็นหน้าจอมืดอยู่

**วิธีแก้:**
1. ตรวจสอบว่า `main.tsx` มีการ import และ wrap ถูกต้อง:
```typescript
import PremiumErrorBoundary from './components/PremiumErrorBoundary.tsx'

<PremiumErrorBoundary>
  <App />
</PremiumErrorBoundary>
```

2. Clear browser cache และ hard reload (Ctrl+Shift+R หรือ Cmd+Shift+R)
3. ตรวจสอบ Console ว่ามี Syntax Errors ใน `PremiumErrorBoundary.tsx` หรือไม่

### ปัญหา: Build Failed บน Frontend

**อาการ:**
```
TypeScript error in PremiumErrorBoundary.tsx
```

**วิธีแก้:**
1. ตรวจสอบว่า TypeScript types ถูกต้อง (ReactNode, ErrorInfo, etc.)
2. รัน `npm run lint` เพื่อดูรายละเอียด error
3. ถ้ายังไม่ได้ ให้ลบ `node_modules` และ reinstall ใหม่

---

## 📊 Monitoring หลังติดตั้ง

### Backend Metrics Tracking

เพิ่มโค้ดนี้ใน `backend/server.js` เพื่อติดตามจำนวน timeout:

```javascript
let hardwareTimeoutCount = 0;

// ใน catch block ของ executeHardwareCommand
if (error.message.includes('HARDWARE_TIMEOUT')) {
  hardwareTimeoutCount++;
  console.warn(`[METRIC] Hardware timeout count: ${hardwareTimeoutCount}`);
  
  // ส่ง alert ถ้าเกิน threshold
  if (hardwareTimeoutCount > 10) {
    // ส่ง Telegram/Google Chat notification
    sendAlert('PBX_HARDWARE_UNSTABLE', { 
      timeoutCount: hardwareTimeoutCount,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Frontend Error Logging

บันทึก errors ไปยัง backend API:

```typescript
// ใน componentDidCatch ของ PremiumErrorBoundary
componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
  // ส่ง error ไปยัง monitoring endpoint
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    }),
  }).catch(err => console.error('Failed to log error:', err));
}
```

---

## 🔄 Rollback Plan (แผนย้อนกลับ)

หากพบปัญหาร้ายแรงหลังติดตั้ง สามารถ rollback ได้ดังนี้:

### Backend Rollback
```bash
cd ~/hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea
git checkout HEAD~1 -- pbx-connector/queue.js
cd backend && npm install
pm2 restart hotel-backend
```

### Frontend Rollback
```bash
cd ~/hotel-ecs-checkin-9c9b5e5498019b789aae5b0200a7609d3c9cd2ea
git checkout HEAD~1 -- frontend/src/components/PremiumErrorBoundary.tsx
git checkout HEAD~1 -- frontend/src/main.tsx
cd frontend && npm run build
pm2 restart hotel-frontend
```

---

## 📚 เอกสารที่เกี่ยวข้อง

- [[wiki/deadlock_prevention|Deadlock Prevention Architecture]] - สถาปัตยกรรมป้องกัน Deadlock อย่างละเอียด
- [[wiki/project_timeline|Project Timeline]] - ประวัติการเปลี่ยนแปลงโครงการ
- [[wiki/troubleshooting|Troubleshooting Guide]] - คู่มือแก้ไขปัญหาทั่วไป
- [[wiki/technician_pbx_manual|Technician PBX Manual]] - คู่มือช่างเทคนิค PBX

---

## ✍️ บันทึกการเปลี่ยนแปลง

| วันที่ | ผู้ดำเนินการ | การเปลี่ยนแปลง | ผลลัพธ์ |
|--------|-------------|---------------|---------|
| 2026-07-20 | Worker Agent | เพิ่ม Safety Timeout Gate และ Premium Error Boundary | ✅ Passed all tests |

---

**หมายเหตุ:** หลังจากติดตั้งสำเร็จ อย่าลืมอัปเดตสถานะใน `project_timeline.md` และแจ้งทีมช่างผ่าน Google Chat Webhook
