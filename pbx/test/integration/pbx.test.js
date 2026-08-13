'use strict';

const { createConnector } = require('../../index');
const simulator = require('../../simulator/pbx-simulator');

describe('PBX Integration Test (TCP Mode)', () => {
  let pbxServer;
  let connector;
  const PORT = 10002;

  beforeAll((done) => {
    // ปิดการพิมพ์ Log ของ Simulator ออกจอเพื่อไม่ให้รบกวนหน้าจอผลเทสของ Jest
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // รีเซ็ตสถานะห้องพักในระบบจำลอง
    Object.keys(simulator.rooms).forEach(k => {
      simulator.rooms[k] = { status: 0, name: '', wake: '', lock: 0, lang: 1 };
    });

    pbxServer = simulator.server;
    pbxServer.listen(PORT, '127.0.0.1', () => {
      done();
    });
  });

  afterAll((done) => {
    jest.restoreAllMocks();
    if (connector) {
      connector.destroy().then(() => {
        pbxServer.close(() => {
          done();
        });
      });
    } else {
      pbxServer.close(() => {
        done();
      });
    }
  });

  test('ควรทำการเชื่อมต่อสำเร็จ และทำ Check-in / Check-out ผ่านตู้ PBX จำลองจริง', async () => {
    connector = createConnector({
      mode: 'tcp',
      host: '127.0.0.1',
      port: PORT,
      heartbeatInterval: 0, // ปิด heartbeat เพื่อความนิ่งในการตรวจสอบคำสั่งหลัก
      retryAttempts: 1,
      commandTimeout: 2000,
    });

    await connector.connect();
    expect(connector.state).toBe('CONNECTED');

    // 1. ทดสอบ Check-in ห้อง 101 พร้อมใส่ชื่อแขก
    const checkin = await connector.checkIn(101, 'TestGuest');
    expect(checkin.success).toBe(true);
    expect(checkin.status).toBe('ON');
    expect(checkin.name).toBe('TestGuest');

    // ยืนยันว่าฝั่ง Simulator อัปเดต Memory State ถูกต้องจริง
    expect(simulator.rooms['101'].status).toBe(1);
    expect(simulator.rooms['101'].name).toBe('TestGuest');

    // 2. ทดสอบขออ่านสถานะห้อง 101 จาก PBX
    const status = await connector.getRoomStatus(101);
    expect(status.statusCode).toBe(1);
    expect(status.statusLabel).toBe('ON');

    // 3. ทดสอบ Check-out ห้อง 101 (ต้องตัดไฟและล้างชื่อแขก)
    const checkout = await connector.checkOut(101);
    expect(checkout.success).toBe(true);
    expect(checkout.status).toBe('OFF');

    expect(simulator.rooms['101'].status).toBe(0);
  });

  test('ควรคืนค่า Error (NACK) เมื่อสั่งการห้องที่ไม่มีจริง', async () => {
    await expect(connector.getRoomStatus(999)).rejects.toThrow('Get room status failed for 0999');
  });

  test('ควรส่งสัญญาณ Ping (Heartbeat) สำเร็จ', async () => {
    const pingResult = await connector.ping();
    expect(pingResult.alive).toBe(true);
    expect(pingResult.version).toContain('DX-COMPACT');
  });
});
