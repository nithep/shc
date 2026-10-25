'use strict';

/**
 * Phase 1.3 — ACKW regression test
 * MockTransport ต้องคืน PWER=ALL ครบทุกห้อง + ACKW แม้ state ว่าง
 * เพื่อให้ getRoomStatus ทำงานได้ (เดิมได้ ACKW เดี่ยว → Unrecognized response body)
 */

const { createConnector } = require('../../index');

describe('MockTransport ACKW / PWER=ALL', () => {
  let pbx;

  beforeAll(async () => {
    pbx = createConnector({ mode: 'mock' });
    await pbx.connect();
  });

  afterAll(async () => {
    if (pbx) await pbx.destroy();
  });

  test('PWER=ALL บน state ว่างต้องคืนสถานะ OFF ครบทุกห้อง ไม่ใช่ ACKW เดี่ยว', async () => {
    const status = await pbx.getRoomStatus(101);
    expect(status.statusLabel).toBe('OFF');
    expect(status.statusCode).toBe(0);
  });

  test('checkIn แล้ว read-back ต้องเป็น ON', async () => {
    await pbx.checkIn(101, 'Phase1 Test');
    const status = await pbx.getRoomStatus(101);
    expect(status.statusLabel).toBe('ON');
  });

  test('checkOut แล้ว read-back ต้องเป็น OFF', async () => {
    await pbx.checkOut(101);
    const status = await pbx.getRoomStatus(101);
    expect(status.statusLabel).toBe('OFF');
  });
});
