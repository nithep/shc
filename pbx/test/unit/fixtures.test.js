'use strict';

const protocol = require('../../protocol');
const fixtures = require('../fixtures/frames.json');

describe('Phonik PBX Protocol Fixture Regression Tests', () => {
  test('ควรแปลงคำสั่งและตรวจสอบคำสั่งตรงตาม Fixtures ใน frames.json', () => {
    for (const item of fixtures) {
      if (item.type === 'INVALID') continue;

      // ทดสอบการสร้างคำสั่งจากข้อมูลใน fixture
      let generatedCmd;
      if (item.command.includes('PWER') && item.command.includes('=')) {
        const valMatch = item.command.match(/PWER\d{1,4}=(\d)?/);
        if (valMatch && valMatch[1] !== undefined) {
          // CMD-ON หรือ CMD-OFF
          const status = parseInt(valMatch[1], 10);
          generatedCmd = protocol.buildSetRoom(item.room, status);
        } else {
          // CMD-STAT
          generatedCmd = protocol.buildGetRoom(item.room);
        }
      } else if (item.command.includes('ROOM')) {
        const nameMatch = item.command.match(/ROOM\d{4}=(.+)/);
        if (nameMatch) {
          generatedCmd = protocol.buildSetName(item.room, nameMatch[1]);
        }
      }

      if (generatedCmd) {
        expect(generatedCmd).toBe(item.command);
      }
    }
  });

  test('ควร parse response ของทุก fixture ตรงตามข้อกำหนด', () => {
    for (const item of fixtures) {
      const parsed = protocol.parseResponse(item.expectedResponse);

      if (item.expectedResponse.includes('NACK')) {
        expect(parsed.error).toBe(true);
        expect(parsed.errorMessage).toContain('NACK');
      } else {
        expect(parsed.error).toBe(false);
        if (item.expectedResponse.includes('PWER')) {
          if (parsed.rooms) {
            expect(parsed.rooms[item.room]).toBeDefined();
          } else {
            const valMatch = item.expectedResponse.match(/PWER\d{1,4}=(on|off|\d)/i);
            expect(parsed.value).toBe(valMatch[1].toLowerCase());
          }
        } else if (item.expectedResponse.includes('ROOM')) {
          const nameMatch = item.expectedResponse.match(/ROOM\d{4}=(.+)/);
          if (nameMatch) {
            expect(parsed.value).toBe(nameMatch[1]);
          }
        }
      }
    }
  });
});
