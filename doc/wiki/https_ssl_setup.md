# การตั้งค่า HTTPS (SSL Certificate) บน Raspberry Pi สำหรับระบบกล้องสแกน QR

## บริบทและปัญหา
เนื่องจากระบบ Hotel ECS นำเสนอผ่าน Web Application และฟีเจอร์ Smart QR Scanner (`Scan.tsx`) จำเป็นต้องเข้าถึงกล้องของอุปกรณ์ (Camera API) นโยบายความปลอดภัยของเบราว์เซอร์ปัจจุบัน (เช่น Chrome, Safari) **บังคับให้หน้าเว็บต้องโหลดผ่านโปรโตคอล HTTPS** เท่านั้น (ยกเว้น localhost) 
หากระบบรันผ่าน HTTP แบบปกติบน Network ภายใน ผู้ใช้งานจะเจอระบบแจ้งเตือนการเชื่อมต่อไม่ปลอดภัย (`insecure_context`) หรือไม่สามารถดึงสตรีมวิดีโอมาแสดงได้

## การแก้ไขและการตั้งค่า
เพื่อแก้ไขปัญหานี้และเปิดให้ Frontend สามารถดึงสตรีมกล้องมาใช้ได้อย่างสมบูรณ์ เราจำเป็นต้องให้บริการ Web App ผ่าน HTTPS:

### วิธีที่ 1: การใช้ Cloudflare Tunnel (แนะนำที่สุดสำหรับ Production)
Cloudflare Tunnel ทำหน้าที่สร้าง Secure Tunnel จาก Raspberry Pi ออกสู่อินเทอร์เน็ต และเข้ารหัส SSL ให้โดยอัตโนมัติที่ Edge ของ Cloudflare

1. ติดตั้ง `cloudflared` บน Raspberry Pi:
   ```bash
   sudo apt-get install cloudflared
   ```
2. ล็อกอินเข้าสู่บัญชี Cloudflare:
   ```bash
   cloudflared tunnel login
   ```
3. สร้าง Tunnel ใหม่สำหรับระบบ Hotel ECS:
   ```bash
   cloudflared tunnel create hotel-ecs-tunnel
   ```
4. ผูก Domain Name ของโรงแรมเข้ากับ Tunnel นี้:
   ```bash
   cloudflared tunnel route dns hotel-ecs-tunnel ecs.yourhotel.com
   ```
5. รัน Tunnel
   เมื่อเข้าใช้งานผ่าน `https://ecs.yourhotel.com/scan` กล้องจะสามารถทำงานได้สมบูรณ์

### วิธีที่ 2: การใช้ Self-Signed Certificate ใน Local Network (Offline Mode)
หากโรงแรมไม่มีอินเทอร์เน็ต และต้องการรันแบบ Offline (Local Network):
1. สร้าง Certificate ด้วย OpenSSL:
   ```bash
   openssl req -nodes -new -x509 -keyout server.key -out server.cert
   ```
2. นำไฟล์ไปตั้งค่าใน Vite (Vite Config):
   ```javascript
   import fs from 'fs';
   export default defineConfig({
     server: {
       https: {
         key: fs.readFileSync('./server.key'),
         cert: fs.readFileSync('./server.cert'),
       }
     }
   })
   ```
3. **ข้อควรระวัง:** อุปกรณ์ที่เข้าใช้งานจะต้องกดยอมรับความเสี่ยงในครั้งแรก (Proceed to unsafe) หรือติดตั้ง Root CA ลงในอุปกรณ์ Kiosk ล่วงหน้า
