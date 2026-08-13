'use strict';

const protocol = require('../../protocol');

describe('Phonik PBX Protocol Engine', () => {
  describe('Room Normalization', () => {
    test('ควรแปลงเลขห้อง 1-4 หลักให้เป็น 4 หลัก zero-padded', () => {
      expect(protocol.normalizeRoom(101)).toBe('0101');
      expect(protocol.normalizeRoom('101')).toBe('0101');
      expect(protocol.normalizeRoom('0101')).toBe('0101');
      expect(protocol.normalizeRoom(2)).toBe('0002');
    });

    test('ควร throw error เมื่อเลขห้องไม่ถูกต้อง', () => {
      expect(() => protocol.normalizeRoom(null)).toThrow('Room number is required');
      expect(() => protocol.normalizeRoom('')).toThrow('Invalid room number');
      expect(() => protocol.normalizeRoom('abc')).toThrow('Invalid room number');
      expect(() => protocol.normalizeRoom('12345')).toThrow('Invalid room number');
    });
  });

  describe('Command Builders', () => {
    test('ควรสร้างคำสั่ง Set Room Status ที่ถูกต้อง', () => {
      expect(protocol.buildSetRoom(101, protocol.ROOM_STATUS.ON)).toBe('..PWER101=1\r\n');
      expect(protocol.buildSetRoom(101, protocol.ROOM_STATUS.ON, 3)).toBe('..PWER101=1\r\n');
      expect(protocol.buildSetRoom('0203', protocol.ROOM_STATUS.OFF)).toBe('..PWER203=0\r\n');
    });

    test('ควร throw error เมื่อใช้ status นอกเหนือจาก 0-3', () => {
      expect(() => protocol.buildSetRoom(101, 4)).toThrow('Invalid room status');
      expect(() => protocol.buildSetRoom(101, -1)).toThrow('Invalid room status');
    });

    test('ควรสร้างคำสั่ง Get Room Status ที่ถูกต้อง', () => {
      expect(protocol.buildGetRoom(101)).toBe('..PWER=ALL\r\n');
    });

    test('ควรสร้างคำสั่ง Set Guest Name และจำกัดความยาว 16 ตัวอักษร', () => {
      expect(protocol.buildSetName(101, 'John Doe')).toBe('..ROOM1017=John Doe\r\n');
      expect(protocol.buildSetName(101, 'A'.repeat(20))).toBe(`..ROOM1017=${'A'.repeat(16)}\r\n`);
    });

    test('ควรสร้างคำสั่ง Get Version', () => {
      expect(protocol.buildGetVersion()).toBe('..VERS=\r\n');
    });

    test('ควรสร้างคำสั่ง Ping', () => {
      expect(protocol.buildPing()).toBe('..VERS=\r\n');
    });

    test('ควรสร้างคำสั่ง STOP', () => {
      expect(protocol.buildStop()).toBe('..STOP\r\n');
    });

    test('ควรสร้างคำสั่ง Set Wakeup Time (hhmm format)', () => {
      expect(protocol.buildSetWake(101, '0630')).toBe('..WAKE1017=0630\r\n');
      expect(() => protocol.buildSetWake(101, '630')).toThrow('Invalid wake time');
      expect(() => protocol.buildSetWake(101, '2400')).toThrow('Invalid wake time');
    });

    test('ควรสร้างคำสั่ง Set Lock Status (0 หรือ 1)', () => {
      expect(protocol.buildSetLock(101, 1)).toBe('..LOCK1017=1\r\n');
      expect(protocol.buildSetLock(101, 0)).toBe('..LOCK1017=0\r\n');
      expect(() => protocol.buildSetLock(101, 2)).toThrow('Invalid lock state');
    });
  });

  describe('Response Parser', () => {
    test('ควร parse PWER status response ได้ถูกต้อง', () => {
      const parsed1 = protocol.parseResponse('==PWER0101=on 14/07/26 18:52:33 - 15/07/26 01:00:00\r\n');
      expect(parsed1.type).toBe(protocol.RESPONSE_TYPE.POWER);
      expect(parsed1.room).toBe('0101');
      expect(parsed1.value).toBe('on');
      expect(parsed1.error).toBe(false);

      const parsed2 = protocol.parseResponse('==PWER102=off\r\n');
      expect(parsed2.type).toBe(protocol.RESPONSE_TYPE.POWER);
      expect(parsed2.room).toBe('102');
      expect(parsed2.value).toBe('off');
      expect(parsed2.error).toBe(false);
    });

    test('ควร parse guest ROOM response ได้ถูกต้อง', () => {
      const parsed = protocol.parseResponse('==ROOM1017=John Doe\r\n');
      expect(parsed.type).toBe(protocol.RESPONSE_TYPE.ROOM);
      expect(parsed.room).toBe('1017');
      expect(parsed.value).toBe('John Doe');
      expect(parsed.error).toBe(false);
    });

    test('ควร parse Multi-line PWER=ALL response ได้ถูกต้อง', () => {
      const multiPwer = '==PWER101=on\r\n==PWER102=off\r\n==ACKW\r\n';
      const parsed = protocol.parseResponse(multiPwer);
      expect(parsed.type).toBe(protocol.RESPONSE_TYPE.POWER);
      expect(parsed.rooms).toEqual({ '101': 'ON', '102': 'OFF' });
    });

    test('ควร parse Multi-line RDSS=ALL response ได้ถูกต้อง', () => {
      const multiRdss = '==RDSS1001=0\r\n==RDSS1017=1\r\n==ACKW\r\n';
      const parsed = protocol.parseResponse(multiRdss);
      expect(parsed.type).toBe(protocol.RESPONSE_TYPE.ROOM);
      expect(parsed.rooms).toEqual({ '1001': '0', '1017': '1' });
    });

    test('ควร parse VERSION response ได้ถูกต้อง', () => {
      const parsed = protocol.parseResponse('==VERS=DX-COMPACT V5.Super Diamond-32C\r\n');
      expect(parsed.type).toBe(protocol.RESPONSE_TYPE.VERSION);
      expect(parsed.value).toBe('DX-COMPACT V5.Super Diamond-32C');
      expect(parsed.error).toBe(false);
    });

    test('ควร parse NACK response เป็น error ได้ถูกต้อง', () => {
      const parsed = protocol.parseResponse('==NACK\r\n');
      expect(parsed.type).toBe(protocol.RESPONSE_TYPE.NACK);
      expect(parsed.error).toBe(true);
      expect(parsed.errorMessage).toContain('PBX returned NACK');
    });

    test('ควร throw/return error เมื่อรูปแบบ response ไม่ถูกต้อง', () => {
      const parsed1 = protocol.parseResponse('invalid_resp');
      expect(parsed1.error).toBe(true);
      expect(parsed1.errorMessage).toContain('Unexpected response format');

      const parsed2 = protocol.parseResponse(null);
      expect(parsed2.error).toBe(true);
    });
  });
});
