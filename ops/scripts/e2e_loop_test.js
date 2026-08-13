/**
 * scripts/e2e_loop_test.js
 * สคริปต์จำลองการทดสอบระบบ API (REST Client) แบบ Closed-Loop
 * ยิงคำสั่งตรงไปที่ API Server (พอร์ต 3000) เพื่อจำลอง Onboarding และกระบวนการเช็คอิน/เช็คเอาท์
 */

const http = require('http');
const db = require('../api/db');

const BASE_URL = 'http://localhost:3000';

// ฟังก์ชันช่วยส่ง HTTP Request แบบ Promise โดยใช้ http module ในตัว Node.js
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ฟังก์ชันสำหรับ Reset ฐานข้อมูลก่อนการทดสอบ เพื่อความน่าเชื่อถือของการตรวจสอบสถานะ (Test Isolation)
function resetDatabase() {
  return new Promise((resolve, reject) => {
    db.db.serialize(() => {
      // ตั้งค่าทุกห้องให้กลับมาว่าง (vacant) และปิดไฟ (OFF)
      db.db.run("UPDATE rooms SET status = 'vacant', power = 0", (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('🧹 [INIT] รีเซ็ตสถานะห้องพักใน Database เรียบร้อย (Database State Reset)');
          resolve();
        }
      });
    });
  });
}

async function runTests() {
  console.log('\n==================================================');
  console.log('🧪 เริ่มต้นการรัน E2E API Loop Test (REST Gateway)');
  console.log('==================================================');

  try {
    // ── STEP 0: Reset Database State เพื่อเริ่มเทสต์จากศูนย์ ──
    await resetDatabase();

    // ── STEP 1: ตรวจเช็คสถานะตั้งต้นของห้องพักทั้งหมด ──
    console.log('\n[STEP 1] ตรวจสอบรายชื่อสถานะห้องพักตั้งต้น...');
    const step1 = await request('GET', '/api/rooms');
    if (step1.status !== 200 || !step1.body.success) {
      throw new Error(`ไม่สามารถดึงข้อมูลห้องพักได้: ${JSON.stringify(step1.body)}`);
    }
    const rooms = step1.body.rooms;
    console.log(`-> พบห้องพักทั้งหมด ${rooms.length} ห้องในฐานข้อมูล:`);
    rooms.forEach(r => {
      console.log(`   - ห้อง ${r.id}: สถานะ = ${r.status}, ไฟฟ้า = ${r.power ? 'ON' : 'OFF'}`);
    });

    const targetRoom = 101;

    // ── STEP 2: ส่งคำสั่ง Check-in ห้อง 101 ──
    console.log(`\n[STEP 2] ส่งคำสั่ง Check-in ห้อง ${targetRoom} (เปิดไฟ + บันทึกชื่อแขก)...`);
    const checkinBody = {
      roomNumber: targetRoom.toString(),
      guestName: 'Somsak Jaidee'
    };
    const step2 = await request('POST', '/api/checkin', checkinBody);
    console.log(`-> HTTP Status: ${step2.status}`);
    console.log(`-> API Response:`, JSON.stringify(step2.body));
    
    // ตรวจสอบว่า HTTP Status = 200 และคำสั่งควบคุมฮาร์ดแวร์ทำงานสำเร็จ
    if (step2.status !== 200 || !step2.body.hardware_status || !step2.body.hardware_status.success) {
      throw new Error(`การ Check-in ล้มเหลว! ได้รับ HTTP Status = ${step2.status}`);
    }
    console.log('✅ Check-in สำเร็จ: ตู้สาขาตอบ ACK และระบบบันทึกฐานข้อมูลแล้ว');

    // ── STEP 3: ตรวจสอบสถานะห้อง 101 หลัง Check-in ──
    console.log(`\n[STEP 3] ตรวจสอบความถูกต้องของสถานะห้อง ${targetRoom} ใน DB...`);
    const step3 = await request('GET', '/api/rooms');
    const room101 = step3.body.rooms.find(r => r.id === targetRoom);
    console.log(`-> ข้อมูลห้อง ${targetRoom}: Status = ${room101.status}, Power = ${room101.power}`);
    
    if (room101.status !== 'occupied' || room101.power !== true) {
      throw new Error(`สถานะห้อง ${targetRoom} ไม่ถูกต้องหลังการ Check-in! (คาดหวัง: occupied / power=true)`);
    }
    console.log('✅ ยืนยันสถานะสำเร็จ: ห้องเปลี่ยนเป็น occupied และระบบไฟเปิด (ON) เรียบร้อย');

    // ── STEP 4: ส่งคำสั่ง Check-out ห้อง 101 ──
    console.log(`\n[STEP 4] ส่งคำสั่ง Check-out ห้อง ${targetRoom} (ตัดระบบไฟ)...`);
    const checkoutBody = {
      roomNumber: targetRoom.toString()
    };
    const step4 = await request('POST', '/api/checkout', checkoutBody);
    console.log(`-> HTTP Status: ${step4.status}`);
    console.log(`-> API Response:`, JSON.stringify(step4.body));

    if (step4.status !== 200 || !step4.body.hardware_status || !step4.body.hardware_status.success) {
      throw new Error(`การ Check-out ล้มเหลว! ได้รับ HTTP Status = ${step4.status}`);
    }
    console.log('✅ Check-out สำเร็จ: ตู้สาขาตัดวงจรไฟฟ้าและตอบ ACK เรียบร้อย');

    // ── STEP 5: ตรวจสอบสถานะห้อง 101 หลัง Check-out ──
    console.log(`\n[STEP 5] ตรวจสอบความถูกต้องของสถานะห้อง ${targetRoom} ใน DB หลังเช็คเอาท์...`);
    const step5 = await request('GET', '/api/rooms');
    const room101Post = step5.body.rooms.find(r => r.id === targetRoom);
    console.log(`-> ข้อมูลห้อง ${targetRoom}: Status = ${room101Post.status}, Power = ${room101Post.power}`);

    if (room101Post.status !== 'vacant' || room101Post.power !== false) {
      throw new Error(`สถานะห้อง ${targetRoom} ไม่ถูกต้องหลังการ Check-out! (คาดหวัง: vacant / power=false)`);
    }
    console.log('✅ ยืนยันสถานะสำเร็จ: ห้องกลับมาว่าง (vacant) และระบบไฟถูกตัด (OFF) เรียบร้อย');

    // ── STEP 6: จำลองการเกิด Hardware Fault บนตู้สาขา (ห้อง 103 ตอบ NACK เสมอ) ──
    console.log('\n[STEP 6] ทดสอบความปลอดภัยของตู้สาขาและบอร์ดควบคุม (Hardware Fault ห้อง 103)...');
    console.log('-> ห้อง 103 ถูกจำลองสถานะบอร์ดขัดข้องและตู้สาขาตอบ NACK เสมอ');
    const checkinFaultBody = {
      roomNumber: '103',
      guestName: 'Somchai Faulty'
    };
    const step6 = await request('POST', '/api/checkin', checkinFaultBody);
    console.log(`-> HTTP Status: ${step6.status}`);
    console.log(`-> API Response:`, JSON.stringify(step6.body));
    
    // ตรวจสอบว่า API คืน HTTP Status 500 (Internal Server Error เนื่องจาก PBX ตอบ NACK)
    if (step6.status !== 500) {
      throw new Error(`คาดหวังข้อผิดพลาด HTTP 500 สำหรับตู้สาขา NACK แต่ได้รับ HTTP Status = ${step6.status}`);
    }
    
    // ตรวจสอบว่าไม่อัปเดตสถานะห้องใน DB เป็น occupied
    const step6Verify = await request('GET', '/api/rooms');
    const room103 = step6Verify.body.rooms.find(r => r.id === 103);
    console.log(`-> ตรวจสอบสถานะห้อง 103 ใน DB หลังสั่งการที่ขัดข้อง: Status = ${room103.status}, Power = ${room103.power}`);
    
    if (room103.status === 'occupied' || room103.power === true) {
      throw new Error('❌ ข้อบกพร่องความปลอดภัย: สถานะห้องเปลี่ยนเป็น occupied แม้ว่าตู้สาขาจะตอบปฏิเสธ (NACK)!');
    }
    console.log('✅ ยืนยันความปลอดภัยสำเร็จ: ระบบป้องกันการเปลี่ยนสถานะหากส่งคำสั่งล้มเหลว (Atomic Transaction Guard)');

    console.log('\n==================================================');
    console.log('🎉 [SUCCESS] การทดสอบ E2E API Loop Test สำเร็จ 100%');
    console.log('==================================================\n');
    return true;

  } catch (error) {
    console.error('\n❌ [TEST FAILED] ตรวจพบข้อผิดพลาดระหว่างการรันทดสอบ:', error.message);
    console.log('==================================================\n');
    return false;
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
