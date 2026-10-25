'use strict';

const { createConnector } = require('../../index');
const protocol = require('../../protocol');

describe('PBX_READ_ONLY connector guard', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.PBX_READ_ONLY;
    delete process.env.PBX_READ_ONLY;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PBX_READ_ONLY;
    } else {
      process.env.PBX_READ_ONLY = originalEnv;
    }
  });

  test('rejects checkIn/checkOut/setGuestName before any transport send', async () => {
    const pbx = createConnector({ mode: 'mock', readOnly: true });
    await pbx.connect();
    const sendSpy = jest.spyOn(pbx._transport, 'send');

    await expect(pbx.checkIn(101, 'Guest')).rejects.toMatchObject({ code: 'PBX_READ_ONLY' });
    await expect(pbx.checkOut(101)).rejects.toMatchObject({ code: 'PBX_READ_ONLY' });
    await expect(pbx.setGuestName(101, 'Guest')).rejects.toMatchObject({ code: 'PBX_READ_ONLY' });
    await expect(
      pbx._sendWithRetry(protocol.buildSetRoom(101, protocol.ROOM_STATUS.ON))
    ).rejects.toMatchObject({ code: 'PBX_READ_ONLY' });

    expect(sendSpy).not.toHaveBeenCalled();
    await pbx.destroy();
  });

  test('allows PWER=ALL read and sends no control frame', async () => {
    const pbx = createConnector({ mode: 'mock', readOnly: true });
    await pbx.connect();
    const sendSpy = jest.spyOn(pbx._transport, 'send');

    const status = await pbx.getRoomStatus(101);

    expect(status.statusLabel).toBe('OFF');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toContain('PWER=ALL');
    expect(sendSpy.mock.calls[0][0]).not.toMatch(/PWER101=/);
    await pbx.destroy();
  });

  test('honors PBX_READ_ONLY=true from environment', async () => {
    process.env.PBX_READ_ONLY = 'true';
    const pbx = createConnector({ mode: 'mock' });
    expect(pbx.readOnly).toBe(true);
    await pbx.destroy();
  });

  test('defaults to writable mode when PBX_READ_ONLY is unset', async () => {
    const pbx = createConnector({ mode: 'mock' });
    expect(pbx.readOnly).toBe(false);
    await pbx.connect();
    await pbx.checkIn(101, 'Guest');
    expect((await pbx.getRoomStatus(101)).statusLabel).toBe('ON');
    await pbx.checkOut(101);
    await pbx.destroy();
  });
});
