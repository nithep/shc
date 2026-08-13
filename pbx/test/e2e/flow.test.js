'use strict';

const { spawn } = require('child_process');
const path = require('path');
const simulator = require('../../simulator/pbx-simulator');

describe('E2E Full Flow Test (API → PBX Simulator)', () => {
  let pbxServer;
  let backendProcess;
  let token;
  const PBX_PORT = 10003;
  const API_PORT = 3001;
  const API_URL = `http://127.0.0.1:${API_PORT}`;

  beforeAll((done) => {
    // ปิด console.log ของ simulator ในกระบวนการปัจจุบันเพื่อไม่ให้รบกวนหน้าจอ Jest
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // 1. สตาร์ท PBX Simulator programmatically บน port 10003
    Object.keys(simulator.rooms).forEach(k => {
      simulator.rooms[k] = { status: 0, name: '', wake: '', lock: 0, lang: 1 };
    });
    pbxServer = simulator.server;
    
    pbxServer.listen(PBX_PORT, '127.0.0.1', () => {
      // 2. สตาร์ท Backend Express Server เป็น Child Process
      const serverPath = path.resolve(__dirname, '../../../backend/server.js');
      
      backendProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          PORT: API_PORT,
          PBX_MODE: 'tcp',
          PBX_PORT: PBX_PORT,
          PBX_HOST: '127.0.0.1',
          ENFORCE_SCHEDULE: 'false'
        }
      });

      // รอให้ Express Server โหลดและรันเสร็จสมบูรณ์
      setTimeout(() => {
        done();
      }, 6000);
    });
  });

  afterAll((done) => {
    jest.restoreAllMocks();

    // 🎬 ปิด Backend Server
    if (backendProcess) {
      backendProcess.kill();
    }

    // 🎬 ปิด Simulator Server
    if (pbxServer) {
      pbxServer.close(() => {
        done();
      });
    } else {
      done();
    }
  });

  test('ควรสามารถสั่ง Check-in ผ่าน API และส่งต่อไปยัง Simulator และอัปเดต DB ได้สำเร็จ', async () => {
    // 1. เรียก API Check-in ห้อง 101 (ส่ง pdpaConsent ไปด้วย)
    const checkinResponse = await fetch(`${API_URL}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomNumber: 101,
        guestName: 'E2EGuest',
        pdpaConsent: { privacyPolicyAccepted: true }
      })
    });
    
    expect(checkinResponse.status).toBe(200);
    const checkinData = await checkinResponse.json();
    expect(checkinData.message).toBe('Check-in successful');
    expect(checkinData.hardware_status.success).toBe(true);
    
    // บันทึก token ไว้ใช้เช็คเอาท์
    token = checkinData.token;

    // ยืนยันว่าฝั่ง Simulator ได้รับคำสั่งเปิดไฟ (status=1) และตั้งชื่อแขกแล้ว
    expect(simulator.rooms['101'].status).toBe(1);
    expect(simulator.rooms['101'].name).toBe('E2EGuest');

    // 2. เรียก API ขอตรวจสอบข้อมูลห้องพักทั้งหมดเพื่อยืนยันสถานะใน Database (SQLite)
    const roomsResponse = await fetch(`${API_URL}/api/rooms`);
    expect(roomsResponse.status).toBe(200);
    const roomsData = await roomsResponse.json();
    
    const room101 = roomsData.rooms.find(r => r.id === 101);
    expect(room101).toBeDefined();
    expect(room101.status).toBe('occupied');
    expect(room101.power).toBe(true);
  });

  test('ควรสามารถสั่ง Check-out ผ่าน API เพื่อตัดไฟและอัปเดต DB ได้สำเร็จ', async () => {
    // 1. เรียก API Check-out ห้อง 101 (แนบ token ใน header)
    const checkoutResponse = await fetch(`${API_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ roomNumber: 101 })
    });

    expect(checkoutResponse.status).toBe(200);
    const checkoutData = await checkoutResponse.json();
    expect(checkoutData.message).toBe('Check-out successful');

    // ยืนยันว่าฝั่ง Simulator ได้รับคำสั่งตัดไฟ (status=0)
    expect(simulator.rooms['101'].status).toBe(0);

    // 2. ตรวจสอบว่าใน Database อัปเดตห้องพักกลับมาว่างและไฟดับแล้ว
    const roomsResponse = await fetch(`${API_URL}/api/rooms`);
    const roomsData = await roomsResponse.json();
    
    const room101 = roomsData.rooms.find(r => r.id === 101);
    expect(room101.status).toBe('vacant');
    expect(room101.power).toBe(false);
  });
});
