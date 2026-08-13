'use strict';

/**
 * @file index.js — PBX Connector Main Entry Point
 *
 * Factory function `createConnector(config)` สร้าง high-level connector
 * สำหรับควบคุมห้องพักผ่าน Phonik PBX.
 *
 * Features:
 * ┌────────────────────────────────────────────────────────────────┐
 * │  ✔ High-level API: checkIn, checkOut, getRoomStatus, etc.     │
 * │  ✔ Heartbeat Timer: ping PBX ทุก 30s เพื่อตรวจ connection     │
 * │  ✔ Retry Logic: Exponential backoff (1s→2s→4s, max 3 ครั้ง)   │
 * │  ✔ Auto-Reconnect: พยายาม reconnect สูงสุด 5 ครั้ง             │
 * │  ✔ Mock Mode: ใช้ mock_pbx.js เป็น fallback สำหรับ dev/test   │
 * │  ✔ EventEmitter: checkin, checkout, heartbeat, error, etc.    │
 * └────────────────────────────────────────────────────────────────┘
 *
 * @module pbx-connector
 * @author Hotel ECS Integration Team
 *
 * @example
 * const { createConnector } = require('./pbx-connector');
 *
 * const pbx = createConnector({
 *   mode: 'tcp',
 *   host: '192.168.1.100',
 *   port: 23,
 * });
 *
 * await pbx.connect();
 * await pbx.checkIn(101);
 * await pbx.checkOut(101);
 * await pbx.destroy();
 */

const { EventEmitter } = require('events');
const protocol = require('./protocol');
const { TcpTransport } = require('./transport/tcp');
const { SerialTransport } = require('./transport/serial');
const { CommandQueue } = require('./queue');
const { logger } = require('./logger');


// ─── Default Configuration ────────────────────────────────────────────────────

/**
 * @typedef {Object} ConnectorConfig
 * @property {'tcp'|'serial'|'mock'} mode - Transport mode
 * @property {string} [host='127.0.0.1']  - TCP host (mode=tcp only)
 * @property {number} [port=23]           - TCP port (mode=tcp only)
 * @property {string} [serialPath]        - Serial port path (mode=serial only), e.g. '/dev/ttyUSB0', 'COM3'
 * @property {number} [baudRate=9600]     - Serial baud rate (mode=serial only)
 * @property {number} [heartbeatInterval=30000] - Heartbeat ping interval in ms
 * @property {number} [retryAttempts=3]   - Max retry attempts per command
 * @property {number} [retryBaseDelay=1000] - Base delay for exponential backoff (ms)
 * @property {number} [reconnectAttempts=5] - Max auto-reconnect attempts
 * @property {number} [commandTimeout=5000] - Timeout per command (ms)
 */

/** @type {ConnectorConfig} */
const DEFAULT_CONFIG = Object.freeze({
  mode: 'mock',
  host: '127.0.0.1',
  port: 23,
  serialPath: '',
  baudRate: 9600,
  heartbeatInterval: 30000,
  retryAttempts: 3,
  retryBaseDelay: 1000,
  reconnectAttempts: 5,
  commandTimeout: 5000,
});

// ─── Connection States ────────────────────────────────────────────────────────

/**
 * Connector state machine states
 * @readonly
 * @enum {string}
 */
const STATE = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DESTROYING: 'DESTROYING',
  DESTROYED: 'DESTROYED',
});

// ─── Mock Transport ───────────────────────────────────────────────────────────

/**
 * Mock Transport สำหรับ development/testing.
 * จำลอง PBX behavior โดยใช้ mock_pbx.js เดิม + in-memory state.
 *
 * @private
 */
class MockTransport extends EventEmitter {
  constructor() {
    super();
    this._connected = false;

    /**
     * In-memory room state สำหรับจำลอง PBX
     * @private {Map<string, {status: number, name: string}>}
     */
    this._rooms = new Map();

    /** @private {string} */
    this._version = 'DX-COMPACT V5.Super Diamond-32C (MOCK)';

    // Load legacy mock_pbx.js ถ้ามี
    try {
      this._legacyMock = require('./mock_pbx');
    } catch (_) {
      this._legacyMock = null;
    }
  }

  /**
   * จำลองการเชื่อมต่อ
   * @returns {Promise<void>}
   */
  async connect() {
    // Simulate connection delay
    await this._delay(50);
    this._connected = true;
    this.emit('connected', { mode: 'mock' });
  }

  /**
   * จำลองการส่งคำสั่ง — parse command แล้วสร้าง mock response.
   *
   * @param {string} command - Raw command string
   * @returns {Promise<string>} Mock response
   */
  async send(command) {
    if (!this._connected) {
      throw new Error('Mock transport is not connected');
    }

    // Simulate PBX processing delay
    await this._delay(20);

    const cmd = command.replace(/\r?\n/g, '').trim();

    // ── Auth commands ──
    if (cmd === '..tcmd=1') {
      return `==tcmd=1${protocol.TERMINATOR}`;
    }
    if (cmd.startsWith('..PASS=')) {
      return `==ACKW${protocol.TERMINATOR}`;
    }

    // ── VERS= (Ping / Version) ──
    if (cmd === '..VERS=') {
      return `==VERS=${this._version}${protocol.TERMINATOR}`;
    }

    // ── STOP ──
    if (cmd === '..STOP') {
      return `==STOP${protocol.TERMINATOR}`;
    }

    // ── PWER commands ──
    const setRoomMatch = cmd.match(/^\.\.PWER(\d{1,4})=(\d+)$/);
    if (setRoomMatch) {
      const [, room, statusStr] = setRoomMatch;
      const days = parseInt(statusStr, 10);
      const status = days > 0 ? protocol.ROOM_STATUS.ON : protocol.ROOM_STATUS.OFF;
      const roomData = this._rooms.get(room) || { status: 0, name: '' };
      roomData.status = status;
      this._rooms.set(room, roomData);

      // Delegate to legacy mock for console output
      if (this._legacyMock) {
        if (status === protocol.ROOM_STATUS.ON) {
          this._legacyMock.turnOnRelay(room);
        } else if (status === protocol.ROOM_STATUS.OFF) {
          this._legacyMock.turnOffRelay(room);
        }
      }

      const statusStrResp = status === protocol.ROOM_STATUS.ON ? 'on' : 'off';
      return `==PWER${room}=${statusStrResp}${protocol.TERMINATOR}`;
    }

    const getRoomMatch = cmd.match(/^\.\.PWER(\d{1,4})=$/);
    if (getRoomMatch) {
      const [, room] = getRoomMatch;
      const roomData = this._rooms.get(room) || { status: 0, name: '' };
      const statusStrResp = roomData.status === protocol.ROOM_STATUS.ON ? 'on' : 'off';
      return `==PWER${room}=${statusStrResp}${protocol.TERMINATOR}`;
    }

    // ── NAME commands ──
    const setNameMatch = cmd.match(/^\.\.NAME(\d{1,4})=(.+)$/);
    if (setNameMatch) {
      const [, room, name] = setNameMatch;
      const roomData = this._rooms.get(room) || { status: 0, name: '' };
      roomData.name = name.substring(0, protocol.MAX_NAME_LENGTH);
      this._rooms.set(room, roomData);
      return `==NAME${room}=${roomData.name}${protocol.TERMINATOR}`;
    }

    const getNameMatch = cmd.match(/^\.\.NAME(\d{1,4})=$/);
    if (getNameMatch) {
      const [, room] = getNameMatch;
      const roomData = this._rooms.get(room) || { status: 0, name: '' };
      return `==NAME${room}=${roomData.name}${protocol.TERMINATOR}`;
    }

    // ── WAKE commands ──
    const setWakeMatch = cmd.match(/^\.\.WAKE(\d{1,4})=(\d{4})$/);
    if (setWakeMatch) {
      const [, room, time] = setWakeMatch;
      return `==WAKE${room}=${time}${protocol.TERMINATOR}`;
    }

    // ── LOCK commands ──
    const setLockMatch = cmd.match(/^\.\.LOCK(\d{1,4})=(\d)$/);
    if (setLockMatch) {
      const [, room, lock] = setLockMatch;
      return `==LOCK${room}=${lock}${protocol.TERMINATOR}`;
    }

    // ── Unknown command ──
    return `==NACK${protocol.TERMINATOR}`;
  }

  /**
   * จำลองการตัดการเชื่อมต่อ
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._connected = false;
    this.emit('disconnected', { mode: 'mock' });
  }

  /**
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }

  /**
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── PBX Connector Class ─────────────────────────────────────────────────────

/**
 * PBX Connector — High-level API สำหรับควบคุมห้องพักผ่าน Phonik PBX.
 *
 * @extends EventEmitter
 *
 * @fires PbxConnector#checkin     - เมื่อ check-in สำเร็จ
 * @fires PbxConnector#checkout    - เมื่อ check-out สำเร็จ
 * @fires PbxConnector#heartbeat   - เมื่อ heartbeat ping สำเร็จ
 * @fires PbxConnector#heartbeat_failed - เมื่อ heartbeat ping ล้มเหลว
 * @fires PbxConnector#connection_lost  - เมื่อตรวจพบว่า connection หลุด
 * @fires PbxConnector#reconnecting    - เมื่อกำลัง reconnect
 * @fires PbxConnector#reconnected     - เมื่อ reconnect สำเร็จ
 * @fires PbxConnector#reconnect_failed - เมื่อ reconnect ล้มเหลวทุกครั้ง
 * @fires PbxConnector#error           - เมื่อเกิด error
 * @fires PbxConnector#state_change    - เมื่อ state เปลี่ยน
 */
class PbxConnector extends EventEmitter {
  /**
   * @param {ConnectorConfig} config
   */
  constructor(config) {
    super();

    /** @type {ConnectorConfig} */
    this.config = { ...DEFAULT_CONFIG, ...config };

    /** @type {string} */
    this._state = STATE.DISCONNECTED;

    /** @private {TcpTransport|SerialTransport|MockTransport|null} */
    this._transport = null;

    /** @private {NodeJS.Timeout|null} */
    this._heartbeatTimer = null;

    /**
     * Timestamp ของ activity ล่าสุด (send/receive)
     * @private {number}
     */
    this._lastActivityTime = 0;

    /**
     * จำนวนครั้ง heartbeat ล้มเหลวติดต่อกัน
     * @private {number}
     */
    this._consecutiveHeartbeatFailures = 0;

    /**
     * ป้องกัน concurrent reconnect attempts
     * @private {boolean}
     */
    this._isReconnecting = false;

    /** @private */
    this._queue = new CommandQueue();

    // Create transport based on mode
    this._createTransport();
  }

  // ─── Properties ───────────────────────────────────────────────────────

  /**
   * Current connector state.
   * @returns {string}
   */
  get state() {
    return this._state;
  }

  /**
   * Whether the connector is connected and ready.
   * @returns {boolean}
   */
  get isReady() {
    return this._state === STATE.CONNECTED && this._transport && this._transport.isConnected();
  }

  /**
   * Timestamp ของ activity ล่าสุด
   * @returns {number}
   */
  get lastActivityTime() {
    return this._lastActivityTime;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /**
   * เชื่อมต่อกับ PBX.
   *
   * @returns {Promise<void>}
   * @throws {Error} เมื่อเชื่อมต่อไม่สำเร็จ
   */
  async connect() {
    if (this._state === STATE.CONNECTED) {
      return;
    }
    if (this._state === STATE.DESTROYED) {
      throw new Error('Connector has been destroyed — create a new instance');
    }

    this._setState(STATE.CONNECTING);

    try {
      await this._connectTransport();

      // === AUTHENTICATION PHASE ===
      logger.info('Authenticating with PBX (tcmd=1)...', { host: this.config.host });
      await this._transport.send(protocol.buildAuthTcmd());
      
      logger.info('Authenticating with PBX (PASS)...', { host: this.config.host });
      // We can use config.pbxPassword or fallback to 1234
      const password = this.config.pbxPassword || '1234';
      await this._transport.send(protocol.buildAuthPass(password));
      // ============================

      this._setState(STATE.CONNECTED);
      this._lastActivityTime = Date.now();
      this._startHeartbeat();
    } catch (err) {
      this._setState(STATE.DISCONNECTED);
      throw err;
    }
  }

  /**
   * ตัดการเชื่อมต่ออย่างสุภาพ (ส่ง STOP command ก่อน).
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._queue.clear();
    this._stopHeartbeat();

    if (this._transport && this._transport.isConnected()) {
      try {
        // ส่ง STOP command ก่อนปิด connection
        await this._transport.send(protocol.buildStop());
      } catch (_) {
        // Ignore — เราจะ disconnect อยู่แล้ว
      }

      await this._transport.disconnect();
    }

    this._setState(STATE.DISCONNECTED);
  }

  /**
   * ทำลาย connector ทั้งหมด — ปิด connection, stop timers, remove listeners.
   * หลังจาก destroy แล้ว ห้ามใช้ instance นี้อีก.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this._setState(STATE.DESTROYING);
    this._queue.clear();
    this._stopHeartbeat();

    if (this._transport) {
      try {
        if (this._transport.isConnected()) {
          await this._transport.disconnect();
        }
      } catch (_) {
        // Ignore cleanup errors
      }

      this._transport.removeAllListeners();
      this._transport = null;
    }

    this.removeAllListeners();
    this._setState(STATE.DESTROYED);
  }

  // ─── High-Level API ───────────────────────────────────────────────────

  /**
   * **Check-in** — เปิดไฟห้องพัก (เปิด relay).
   *
   * @param {string|number} room - Room number
   * @param {string} [guestName] - Guest name (optional, max 16 chars)
   * @param {number} [days=1] - Number of days for check-in (power duration)
   * @returns {Promise<Object>} { success, room, status, name? }
   * @throws {Error} เมื่อคำสั่งล้มเหลวหลัง retry ทั้งหมด
   *
   * @example
   * const result = await pbx.checkIn(101, 'John Doe', 3);
   * // => { success: true, room: '0101', status: 'ON', name: 'John Doe' }
   */
  async checkIn(room, guestName, days = 1) {
    return this._queue.add(async () => {
      this._ensureReady();
      const normalizedRoom = protocol.normalizeRoom(room);
      logger.info(`Starting Check-in pipeline for room ${normalizedRoom}`, { roomNo: normalizedRoom, commandType: 'ROOM_ON' });

      // Set room ON
      const roomCmd = protocol.buildSetRoom(room, protocol.ROOM_STATUS.ON, days);
      const roomResp = await this._sendWithRetry(roomCmd);
      const roomParsed = protocol.parseResponse(roomResp);

      if (roomParsed.error) {
        const errStr = `Check-in failed for room ${normalizedRoom}: ${roomParsed.errorMessage}`;
        logger.error(errStr, { roomNo: normalizedRoom, commandType: 'ROOM_ON' });
        throw new Error(errStr);
      }

      const result = {
        success: true,
        room: normalizedRoom,
        status: protocol.ROOM_STATUS_LABEL[protocol.ROOM_STATUS.ON],
      };

      // Set guest name (if provided)
      if (guestName) {
        try {
          const nameCmd = protocol.buildSetName(room, guestName);
          const nameResp = await this._sendWithRetry(nameCmd);
          const nameParsed = protocol.parseResponse(nameResp);
          result.name = nameParsed.value || guestName;
        } catch (err) {
          // Name setting is non-critical — don't fail the check-in
          result.nameError = err.message;
          this.emit('error', new Error(`Set guest name failed for room ${normalizedRoom}: ${err.message}`));
        }
      }

      logger.info(`Check-in succeeded for room ${normalizedRoom}`, { roomNo: normalizedRoom, commandType: 'ROOM_ON' });
      this.emit('checkin', result);

      return result;
    });
  }

  /**
   * **Check-out** — ตัดไฟห้องพัก (ปิด relay).
   *
   * @param {string|number} room - Room number
   * @returns {Promise<Object>} { success, room, status }
   * @throws {Error} เมื่อคำสั่งล้มเหลวหลัง retry ทั้งหมด
   *
   * @example
   * const result = await pbx.checkOut(101);
   * // => { success: true, room: '0101', status: 'OFF' }
   */
  async checkOut(room) {
    return this._queue.add(async () => {
      this._ensureReady();
      const normalizedRoom = protocol.normalizeRoom(room);
      logger.info(`Starting Check-out pipeline for room ${normalizedRoom}`, { roomNo: normalizedRoom, commandType: 'ROOM_OFF' });

      // Clear guest name first
      try {
        const clearNameCmd = protocol.buildSetName(room, ' ');
        await this._sendWithRetry(clearNameCmd);
      } catch (_) {
        // Non-critical
      }

      // Set room OFF
      const roomCmd = protocol.buildSetRoom(room, protocol.ROOM_STATUS.OFF);
      const roomResp = await this._sendWithRetry(roomCmd);
      const roomParsed = protocol.parseResponse(roomResp);

      if (roomParsed.error) {
        const errStr = `Check-out failed for room ${normalizedRoom}: ${roomParsed.errorMessage}`;
        logger.error(errStr, { roomNo: normalizedRoom, commandType: 'ROOM_OFF' });
        throw new Error(errStr);
      }


      const result = {
        success: true,
        room: normalizedRoom,
        status: protocol.ROOM_STATUS_LABEL[protocol.ROOM_STATUS.OFF],
      };

      logger.info(`Check-out succeeded for room ${normalizedRoom}`, { roomNo: normalizedRoom, commandType: 'ROOM_OFF' });
      this.emit('checkout', result);

      return result;
    });
  }

  /**
   * อ่านสถานะห้องพัก.
   *
   * @param {string|number} room - Room number
   * @returns {Promise<Object>} { room, status, statusCode, statusLabel }
   *
   * @example
   * const status = await pbx.getRoomStatus(101);
   * // => { room: '0101', status: 1, statusCode: 1, statusLabel: 'ON' }
   */
  async getRoomStatus(room) {
    return this._queue.add(async () => {
      this._ensureReady();

      const normalizedRoom = protocol.normalizeRoom(room);
      const cmd = protocol.buildGetRoom(room);
      const resp = await this._sendWithRetry(cmd, true); // true = isMultiLine
      const parsed = protocol.parseResponse(resp);

      if (parsed.error) {
        throw new Error(`Get room status failed for ${normalizedRoom}: ${parsed.errorMessage}`);
      }

      let statusCode;
      let statusLabel = 'UNKNOWN';

      if (parsed.rooms) {
        // แกะสถานะจากผลลัพธ์แบบกลุ่ม
        const cleanRoom = String(room).replace(/^0+/, '') || '0';
        if (!parsed.rooms[cleanRoom]) {
          throw new Error(`Get room status failed for ${normalizedRoom}: Room does not exist in PBX response`);
        }
        const pState = parsed.rooms[cleanRoom];
        statusCode = pState === 'ON' ? protocol.ROOM_STATUS.ON : protocol.ROOM_STATUS.OFF;
        statusLabel = pState;
      } else if (parsed.type === protocol.RESPONSE_TYPE.POWER) {
        statusCode = parsed.value === 'on' ? protocol.ROOM_STATUS.ON : protocol.ROOM_STATUS.OFF;
        statusLabel = protocol.ROOM_STATUS_LABEL[statusCode] || 'UNKNOWN';
      } else {
        statusCode = parseInt(parsed.value, 10);
        statusLabel = protocol.ROOM_STATUS_LABEL[statusCode] || 'UNKNOWN';
      }

      return {
        room: normalizedRoom,
        status: statusCode,
        statusCode,
        statusLabel,
      };
    });
  }

  /**
   * ตั้งชื่อแขกสำหรับห้องพัก.
   *
   * @param {string|number} room - Room number
   * @param {string} name - Guest name (max 16 chars)
   * @returns {Promise<Object>} { room, name }
   */
  async setGuestName(room, name) {
    return this._queue.add(async () => {
      this._ensureReady();

      const normalizedRoom = protocol.normalizeRoom(room);
      const cmd = protocol.buildSetName(room, name);
      const resp = await this._sendWithRetry(cmd);
      const parsed = protocol.parseResponse(resp);

      if (parsed.error) {
        throw new Error(`Set guest name failed for ${normalizedRoom}: ${parsed.errorMessage}`);
      }

      return {
        room: normalizedRoom,
        name: parsed.value,
      };
    });
  }

  /**
   * อ่านชื่อแขกของห้องพัก.
   *
   * @param {string|number} room - Room number
   * @returns {Promise<Object>} { room, name }
   */
  async getGuestName(room) {
    return this._queue.add(async () => {
      this._ensureReady();

      const normalizedRoom = protocol.normalizeRoom(room);
      const cmd = protocol.buildGetName(room);
      const resp = await this._sendWithRetry(cmd);
      const parsed = protocol.parseResponse(resp);

      if (parsed.error) {
        throw new Error(`Get guest name failed for ${normalizedRoom}: ${parsed.errorMessage}`);
      }

      return {
        room: normalizedRoom,
        name: parsed.value,
      };
    });
  }

  /**
   * อ่าน PBX firmware version.
   *
   * @returns {Promise<string>} Version string
   */
  async getVersion() {
    return this._queue.add(async () => {
      this._ensureReady();

      const cmd = protocol.buildGetVersion();
      const resp = await this._sendWithRetry(cmd);
      const parsed = protocol.parseResponse(resp);

      if (parsed.error) {
        throw new Error(`Get version failed: ${parsed.errorMessage}`);
      }

      return parsed.value;
    });
  }

  /**
   * ส่ง Ping (heartbeat) ไปยัง PBX เพื่อเช็ค connection.
   * ใช้ VERS= command เพราะเป็น read-only ไม่มี side effect.
   *
   * @returns {Promise<{alive: boolean, latency: number, version: string}>}
   */
  async ping() {
    return this._queue.add(async () => {
      this._ensureReady();

      const start = Date.now();
      const cmd = protocol.buildPing();

      try {
        const resp = await this._transport.send(cmd);
        const latency = Date.now() - start;
        const parsed = protocol.parseResponse(resp);

        this._lastActivityTime = Date.now();
        this._consecutiveHeartbeatFailures = 0;

        return {
          alive: !parsed.error,
          latency,
          version: parsed.value || '',
        };
      } catch (err) {
        return {
          alive: false,
          latency: Date.now() - start,
          version: '',
          error: err.message,
        };
      }
    });
  }

  // ─── Heartbeat System ─────────────────────────────────────────────────

  /**
   * เริ่ม heartbeat timer.
   * ส่ง ping ทุก heartbeatInterval ms.
   * ถ้า ping ล้มเหลว 2 ครั้งติดต่อกัน → connection_lost → auto-reconnect.
   *
   * @private
   */
  _startHeartbeat() {
    this._stopHeartbeat();

    if (this.config.heartbeatInterval <= 0) {
      return; // Heartbeat disabled
    }

    this._heartbeatTimer = setInterval(async () => {
      // ข้าม heartbeat ถ้ากำลัง reconnect หรือ state ไม่ใช่ CONNECTED
      if (this._state !== STATE.CONNECTED || this._isReconnecting) {
        return;
      }

      try {
        const parsed = await this.ping();

        if (parsed.alive) {
          /**
           * Heartbeat (ping) สำเร็จ
           * @event PbxConnector#heartbeat
           * @type {Object}
           * @property {number} timestamp
           * @property {string} version
           */
          this.emit('heartbeat', {
            timestamp: Date.now(),
            version: parsed.version || '',
          });
        } else {
          throw new Error(parsed.error || 'Ping failed');
        }
      } catch (err) {
        this._consecutiveHeartbeatFailures++;

        /**
         * Heartbeat ล้มเหลว
         * @event PbxConnector#heartbeat_failed
         * @type {Object}
         */
        this.emit('heartbeat_failed', {
          timestamp: Date.now(),
          consecutiveFailures: this._consecutiveHeartbeatFailures,
          error: err.message,
        });

        // ถ้าล้มเหลว 2 ครั้งติดต่อกัน → connection lost
        if (this._consecutiveHeartbeatFailures >= 2) {
          /**
           * Connection lost — ตรวจพบจาก heartbeat failure
           * @event PbxConnector#connection_lost
           */
          this.emit('connection_lost', {
            timestamp: Date.now(),
            consecutiveFailures: this._consecutiveHeartbeatFailures,
          });

          // เริ่ม auto-reconnect
          this._autoReconnect();
        }
      }
    }, this.config.heartbeatInterval);

    // ป้องกัน timer block process exit
    if (this._heartbeatTimer.unref) {
      this._heartbeatTimer.unref();
    }
  }

  /**
   * หยุด heartbeat timer.
   * @private
   */
  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // ─── Retry Logic (Exponential Backoff) ────────────────────────────────

  /**
   * ส่งคำสั่งพร้อม retry logic.
   * Exponential backoff: attempt 1 → 1s, attempt 2 → 2s, attempt 3 → 4s.
   *
   * @private
   * @param {string} command - Raw command string (with TERMINATOR)
   * @returns {Promise<string>} Raw response
   * @throws {Error} เมื่อล้มเหลวหลัง retry ทั้งหมด
   */
  async _sendWithRetry(command, isMultiLine = false) {
    const maxAttempts = this.config.retryAttempts;
    const baseDelay = this.config.retryBaseDelay;
    let lastError;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        // Attempt 0 = first try (ไม่ใช่ retry)
        if (attempt > 0) {
          // Exponential backoff: baseDelay * 2^(attempt-1)
          // attempt 1 → 1000ms, attempt 2 → 2000ms, attempt 3 → 4000ms
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await this._sleep(delay);
        }

        const response = await this._transport.send(command, undefined, isMultiLine);
        this._lastActivityTime = Date.now();
        return response;
      } catch (err) {
        lastError = err;

        const cmdClean = command.replace(/\r?\n/g, '');
        const isLastAttempt = attempt >= maxAttempts;

        if (!isLastAttempt) {
          const nextDelay = baseDelay * Math.pow(2, attempt);
          this.emit('error', new Error(
            `Command "${cmdClean}" failed (attempt ${attempt + 1}/${maxAttempts + 1}), ` +
            `retrying in ${nextDelay}ms: ${err.message}`
          ));
        }
      }
    }

    // ทุก attempt ล้มเหลว
    const cmdClean = command.replace(/\r?\n/g, '');
    throw new Error(
      `Command "${cmdClean}" failed after ${maxAttempts + 1} attempts: ${lastError.message}`
    );
  }

  // ─── Auto-Reconnect ───────────────────────────────────────────────────

  /**
   * Auto-reconnect เมื่อ connection หลุด.
   * Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 attempts).
   *
   * @private
   */
  async _autoReconnect() {
    // ป้องกัน concurrent reconnect
    if (this._isReconnecting) {
      return;
    }

    this._isReconnecting = true;
    this._stopHeartbeat();
    this._setState(STATE.RECONNECTING);

    const maxAttempts = this.config.reconnectAttempts;
    const baseDelay = this.config.retryBaseDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delay = baseDelay * Math.pow(2, attempt - 1);

      /**
       * กำลัง reconnect
       * @event PbxConnector#reconnecting
       * @type {Object}
       */
      this.emit('reconnecting', {
        attempt,
        maxAttempts,
        delay,
        timestamp: Date.now(),
      });

      await this._sleep(delay);

      try {
        // ปิด transport เก่า
        if (this._transport) {
          try {
            await this._transport.disconnect();
          } catch (_) {
            // Ignore
          }
        }

        // สร้าง transport ใหม่และเชื่อมต่อ
        this._createTransport();
        await this._connectTransport();

        // === AUTHENTICATION PHASE ===
        logger.info('Authenticating with PBX during reconnect (tcmd=1)...', { host: this.config.host });
        await this._transport.send(protocol.buildAuthTcmd());
        
        logger.info('Authenticating with PBX during reconnect (PASS)...', { host: this.config.host });
        const password = this.config.pbxPassword || '1234';
        await this._transport.send(protocol.buildAuthPass(password));
        // ============================

        // ทดสอบ connection ด้วย ping
        const cmd = protocol.buildPing();
        const resp = await this._transport.send(cmd);
        const parsed = protocol.parseResponse(resp);

        if (!parsed.error) {
          // Reconnect สำเร็จ!
          this._setState(STATE.CONNECTED);
          this._isReconnecting = false;
          this._consecutiveHeartbeatFailures = 0;
          this._lastActivityTime = Date.now();
          this._startHeartbeat();

          /**
           * Reconnect สำเร็จ
           * @event PbxConnector#reconnected
           * @type {Object}
           */
          this.emit('reconnected', {
            attempt,
            timestamp: Date.now(),
          });

          return;
        }
      } catch (err) {
        this.emit('error', new Error(
          `Reconnect attempt ${attempt}/${maxAttempts} failed: ${err.message}`
        ));
      }
    }

    // ทุก attempt ล้มเหลว
    this._isReconnecting = false;
    this._setState(STATE.DISCONNECTED);

    /**
     * Reconnect ล้มเหลวทุกครั้ง
     * @event PbxConnector#reconnect_failed
     * @type {Object}
     */
    this.emit('reconnect_failed', {
      maxAttempts,
      timestamp: Date.now(),
    });
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  /**
   * สร้าง transport instance ตาม config.mode
   * @private
   */
  _createTransport() {
    const { mode, commandTimeout } = this.config;

    switch (mode) {
      case 'tcp':
        this._transport = new TcpTransport({ timeout: commandTimeout });
        break;

      case 'serial':
        this._transport = new SerialTransport({ timeout: commandTimeout });
        break;

      case 'mock':
        this._transport = new MockTransport();
        break;

      default:
        throw new Error(`Unknown transport mode: "${mode}" — must be 'tcp', 'serial', or 'mock'`);
    }

    // Forward transport events
    this._transport.on('error', (err) => {
      this.emit('error', err);
    });

    this._transport.on('disconnected', (info) => {
      // ถ้า state เป็น CONNECTED → unexpected disconnect
      if (this._state === STATE.CONNECTED) {
        this.emit('connection_lost', {
          timestamp: Date.now(),
          info,
        });
        this._autoReconnect();
      }
    });
  }

  /**
   * เชื่อมต่อ transport ตาม config.mode
   * @private
   * @returns {Promise<void>}
   */
  async _connectTransport() {
    const { mode, host, port, serialPath, baudRate } = this.config;

    switch (mode) {
      case 'tcp':
        await this._transport.connect(host, port);
        break;

      case 'serial':
        await this._transport.connect(serialPath, baudRate);
        break;

      case 'mock':
        await this._transport.connect();
        break;

      default:
        throw new Error(`Unknown transport mode: "${mode}"`);
    }
  }

  /**
   * ตรวจสอบว่า connector พร้อมใช้งาน.
   * @private
   * @throws {Error} ถ้ายังไม่ได้เชื่อมต่อ
   */
  _ensureReady() {
    if (this._state === STATE.DESTROYED) {
      throw new Error('Connector has been destroyed');
    }
    if (this._state !== STATE.CONNECTED || !this._transport || !this._transport.isConnected()) {
      throw new Error(
        `Connector is not ready (state: ${this._state}). ` +
        'Call connect() first or wait for reconnection.'
      );
    }
  }

  /**
   * Set state และ emit event.
   * @private
   * @param {string} newState
   */
  _setState(newState) {
    const oldState = this._state;
    if (oldState === newState) return;

    this._state = newState;

    /**
     * State เปลี่ยน
     * @event PbxConnector#state_change
     * @type {Object}
     */
    this.emit('state_change', {
      from: oldState,
      to: newState,
      timestamp: Date.now(),
    });
  }

  /**
   * Promise-based sleep.
   * @private
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * สร้าง PBX Connector instance.
 *
 * @param {ConnectorConfig} config - Configuration object
 * @returns {PbxConnector} Connector instance พร้อมใช้งาน
 *
 * @example
 * // TCP mode — เชื่อมต่อผ่าน LAN
 * const pbx = createConnector({
 *   mode: 'tcp',
 *   host: '192.168.1.100',
 *   port: 23,
 * });
 *
 * @example
 * // Serial mode — เชื่อมต่อผ่านพอร์ต LAN ของPBX
 * const pbx = createConnector({
 *   mode: 'serial',
 *   serialPath: '/dev/ttyUSB0',
 *   baudRate: 9600,
 * });
 *
 * @example
 * // Mock mode — สำหรับ development/testing
 * const pbx = createConnector({ mode: 'mock' });
 */
function createConnector(config = {}) {
  return new PbxConnector(config);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createConnector,
  PbxConnector,
  STATE,
  DEFAULT_CONFIG,

  // Re-export protocol for convenience
  protocol,
  ROOM_STATUS: protocol.ROOM_STATUS,
  ROOM_STATUS_LABEL: protocol.ROOM_STATUS_LABEL,
};
