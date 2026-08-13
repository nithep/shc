# Hotel ECS Frontend - Troubleshooting Guide

## 🚨 ปัญหาที่พบบ่อยและวิธีแก้ไข

### 1. ไม่สามารถเข้าใช้งาน http://localhost:5173 ได้

#### อาการ:
- เปิดเบราว์เซอร์แล้วหน้าขาว
- แสดง error "Cannot GET /"
- Loading ตลอดเวลา

#### วิธีแก้ไข:

**ขั้นตอนที่ 1: ตรวจสอบว่า Frontend Server รันอยู่หรือไม่**
```bash
# Windows PowerShell
netstat -ano | findstr "5173"

# หรือตรวจสอบ processes
Get-Process -Name node
```

ถ้าไม่พบ process ที่ใช้ port 5173 ให้รันใหม่:
```bash
cd frontend
npm run dev
```

**ขั้นตอนที่ 2: ตรวจสอบ Console Errors**
กด F12 → Tab Console → ดู errors สีแดง

Errors ที่พบบ่อย:
- `Failed to fetch` → Backend ไม่รัน (port 3000)
- `Module not found` → Dependencies ขาดหาย
- `SyntaxError` → มี bug ใน code

**ขั้นตอนที่ 3: ลอง URL อื่นๆ**
แทนที่จะเข้า root (/) ลองเข้า:
- ✅ http://localhost:5173/checkin (หน้า Check-in)
- ✅ http://localhost:5173/guest (Guest view)
- ✅ http://localhost:5173/staff (Staff dashboard)
- ✅ http://localhost:5173/admin (Admin panel)

---

### 2. หน้าขาวหรือ Blank Screen

#### สาเหตุ:
- JavaScript error ใน App.tsx หรือ components
- CSS ไม่โหลด
- React Router ผิดพลาด

#### วิธีแก้ไข:

**ตรวจสอบ Browser Console:**
```javascript
// เปิด DevTools (F12)
// ดูใน Console tab ว่ามี error อะไร
```

**Common Fixes:**
```bash
# 1. ลบ node_modules และติดตั้งใหม่
cd frontend
rm -rf node_modules
npm install

# 2. Clear Vite cache
rm -rf node_modules/.vite

# 3. Restart server
npm run dev
```

**ตรวจสอบ index.html:**
```html
<!-- ต้องมีบรรทัดนี้ -->
<script type="module" src="/src/main.tsx"></script>
```

---

### 3. CORS Errors

#### อาการ:
```
Access to fetch at 'http://localhost:3000/api/...' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

#### วิธีแก้ไข:

**Backend ต้องเปิด CORS:**
ตรวจสอบ `backend/server.js`:
```javascript
const cors = require('cors');
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
```

**Vite Proxy (มีอยู่แล้ว):**
ใน `frontend/vite.config.ts`:
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    }
  }
}
```

---

### 4. Tailwind CSS ไม่ทำงาน

#### อาการ:
- ไม่มี styles เลย
- Classes ของ Tailwind ไม่มีผล

#### วิธีแก้ไข:

**ตรวจสอบ tailwind.config.js:**
```javascript
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",  // สำคัญ!
  ],
  // ...
}
```

**ตรวจสอบ index.css:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Restart Vite:**
บางครั้งต้อง restart เพื่อ reload Tailwind config
```bash
npm run dev
```

---

### 5. Routing Problems

#### อาการ:
- เข้า URL แล้วได้ 404
- Navigate ไปหน้าอื่นไม่ได้

#### วิธีแก้ไข:

**ตรวจสอบ App.tsx routes:**
```typescript
<Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/checkin" element={<CheckIn />} />
  <Route path="/guest" element={<GuestView />} />
  {/* ... */}
</Routes>
```

**BrowserRouter ต้องหุ้ม Routes:**
```typescript
<BrowserRouter>
  <Routes>
    {/* routes here */}
  </Routes>
</BrowserRouter>
```

---

### 6. QR Scanner ไม่ทำงาน

#### อาการ:
- กดปุ่มสแกนแล้วไม่มีอะไรเกิดขึ้น
- กล้องไม่เปิด

#### วิธีแก้ไข:

**ตรวจสอบ Permissions:**
- Chrome: Settings → Privacy → Camera → Allow localhost:5173
- ต้องใช้ HTTPS หรือ localhost เท่านั้น

**ตรวจสอบ ZXing imports:**
```typescript
import { BrowserMultiFormatReader } from '@zxing/browser';
```

**Console Errors:**
```
NotFoundError: Requested device not found
→ ไม่มีกล้องหรือถูกปฏิเสธการเข้าถึง
```

---

### 7. API Calls ล้มเหลว

#### อาการ:
- Check-in ไม่ได้
- ข้อมูลไม่โหลด
- Network errors

#### วิธีแก้ไข:

**ตรวจสอบ Backend:**
```bash
# Backend ต้องรันที่ port 3000
curl http://localhost:3000/api/health
```

Response ที่คาดหวัง:
```json
{
  "success": true,
  "status": "healthy"
}
```

**ตรวจสอบ api.ts configuration:**
```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
```

**สร้างไฟล์ .env:**
```env
VITE_API_URL=http://localhost:3000/api
```

---

## 🔍 Debugging Checklist

### Frontend Server
- [ ] Node.js ติดตั้งแล้ว (`node --version`)
- [ ] Dependencies ติดตั้งครบ (`npm install`)
- [ ] Server รันอยู่ (`npm run dev`)
- [ ] Port 5173 ว่าง

### Backend Server
- [ ] Backend รันที่ port 3000
- [ ] Health check ผ่าน (`/api/health`)
- [ ] CORS เปิดใช้งาน
- [ ] Database เชื่อมต่อได้

### Browser
- [ ] Console ไม่มี errors
- [ ] Network tab ไม่มี failed requests
- [ ] LocalStorage มี auth token (ถ้า login แล้ว)
- [ ] Camera permissions อนุญาต (สำหรับ QR scan)

### Network
- [ ] Frontend → Backend connection ทำงาน
- [ ] No CORS errors
- [ ] WebSocket/SSE connection (ถ้าใช้)

---

## 🛠️ Quick Fix Commands

### Restart Everything
```bash
# Terminal 1 - PBX Simulator
cd pbx-connector
npm start

# Terminal 2 - Backend
cd backend
npm start

# Terminal 3 - Frontend
cd frontend
npm run dev
```

### Clean Install
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Check Ports
```bash
# Windows
netstat -ano | findstr "3000"
netstat -ano | findstr "5173"
netstat -ano | findstr "10001"

# Kill process (Windows)
taskkill /PID <PID> /F
```

---

## 📞 ติดต่อ Support

หากยังแก้ไขปัญหาไม่ได้:

1. **เก็บ Logs:**
   ```bash
   # Frontend logs
   npm run dev > frontend.log 2>&1
   
   # Backend logs
   cd ../backend
   npm start > backend.log 2>&1
   ```

2. **Screenshot Errors:**
   - Browser console errors
   - Network tab failures
   - Terminal output

3. **ระบุ Environment:**
   - OS: Windows/Mac/Linux
   - Node version: `node --version`
   - Browser: Chrome/Firefox/Safari version

---

## ✅ การทดสอบว่าระบบทำงานปกติ

### Test 1: Landing Page
```
URL: http://localhost:5173/
Expected: หน้า landing พร้อมปุ่ม 3 ปุ่ม (Guest/Staff/Admin)
```

### Test 2: Check-in Page
```
URL: http://localhost:5173/checkin
Expected: 
- QR Scanner UI
- PDPA Consent checkbox
- Form inputs
```

### Test 3: API Connection
```javascript
// เปิด browser console แล้วพิมพ์:
fetch('/api/health')
  .then(r => r.json())
  .then(console.log)

// Expected: { success: true, status: "healthy" }
```

### Test 4: Full Flow
1. เข้า `/checkin`
2. สแกน QR Code (หรือกรอก manual)
3. ยอมรับ PDPA
4. กดเช็คอิน
5. ควรได้ success animation

---

## 🎯 Prevention Tips

1. **Always check console** ก่อนรายงานปัญหา
2. **Use latest browser** (Chrome recommended)
3. **Keep dependencies updated** (`npm update`)
4. **Test on multiple browsers**
5. **Clear cache regularly** (Ctrl+Shift+R)
6. **Use Incognito mode** สำหรับ testing

---

**Last Updated:** 2025-01-15  
**Version:** 1.0.0
