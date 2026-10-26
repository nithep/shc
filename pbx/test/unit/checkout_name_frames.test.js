'use strict';

const { EventEmitter } = require('events');
const { createConnector } = require('../../index');

class RecordingTransport extends EventEmitter {
  constructor() {
    super();
    this.frames = [];
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  async send(command) {
    this.frames.push(command);
    const frame = command.replace(/\r?\n$/, '');

    switch (frame) {
      case '..tcmd=1':
        return '==ACKW\r\n';
      case '..PWER101=0':
        return '==PWER101=off\r\n';
      case '..PWER101=1':
        return '==PWER101=on\r\n';
      case '..ROOM1017=John Doe':
        return '==ROOM1017=John Doe\r\n';
      default:
        if (frame.startsWith('..PASS=')) {
          return '==ACKW\r\n';
        }
        throw new Error(`Unexpected frame: ${JSON.stringify(frame)}`);
    }
  }
}

describe('PBX name frames', () => {
  let pbx;
  let transport;

  beforeEach(async () => {
    pbx = createConnector({
      mode: 'mock',
      heartbeatInterval: 0,
      retryAttempts: 0,
    });
    transport = new RecordingTransport();
    pbx._transport = transport;
    await pbx.connect();
    transport.frames.length = 0;
  });

  afterEach(async () => {
    if (pbx) {
      await pbx.destroy();
    }
  });

  test('checkOut sends only the power-off frame', async () => {
    const result = await pbx.checkOut(101);

    expect(result.status).toBe('OFF');
    expect(transport.frames).toEqual(['..PWER101=0\r\n']);
  });

  test('checkIn without a usable name sends only the power-on frame', async () => {
    await pbx.checkIn(101);
    expect(transport.frames).toEqual(['..PWER101=1\r\n']);

    transport.frames.length = 0;
    await pbx.checkIn(101, '   ');
    expect(transport.frames).toEqual(['..PWER101=1\r\n']);
  });

  test('checkIn with a real name sends power-on then the exact name frame', async () => {
    const result = await pbx.checkIn(101, 'John Doe');

    expect(result.name).toBe('John Doe');
    expect(transport.frames).toEqual([
      '..PWER101=1\r\n',
      '..ROOM1017=John Doe\r\n',
    ]);
  });

  test('setGuestName rejects a blank name without sending any frame', async () => {
    await expect(pbx.setGuestName(101, ' '))
      .rejects.toThrow('Guest name must contain at least one printable character');

    expect(transport.frames).toEqual([]);
  });
});
