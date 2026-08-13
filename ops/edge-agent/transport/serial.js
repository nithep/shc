'use strict';

/**
 * @file transport/serial.js — พอร์ต LAN ของPBX Transport for Phonik PBX
 *
 * ใช้ `serialport` library สำหรับเชื่อมต่อกับ PBX ผ่าน พอร์ต LAN ของPBX.
 * Text-based ASCII mode — **ไม่ใช่ binary hex**.
 *
 * Interface เหมือนกับ TcpTransport เพื่อให้ swap ได้โดย connector ไม่ต้องเปลี่ยนโค้ด.
 *
 * @module pbx-connector/transport/serial
 * @author Hotel ECS Integration Team
 */

const { EventEmitter } = require('events');
const { TERMINATOR } = require('../protocol');

/**
 * Default serial baud rate for Phonik PBX
 * @constant {number}
 */
const DEFAULT_BAUD_RATE = 9600;

/**
 * Default command timeout in milliseconds
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * พอร์ต LAN ของPBX Transport สำหรับสื่อสารกับ Phonik PBX.
 *
 * @extends EventEmitter
 * @fires SerialTransport#connected
 * @fires SerialTransport#disconnected
 * @fires SerialTransport#error
 * @fires SerialTransport#data
 *
 * @example
 * const serial = new SerialTransport();
 * await serial.connect('/dev/ttyUSB0', 9600);
 * // Windows: await serial.connect('COM3', 9600);
 * const response = await serial.send('..VERS=\r\n');
 * console.log(response); // '=>VERS=DX-COMPACT V5.Super Diamond-32C\r\n'
 * await serial.disconnect();
 */
class SerialTransport extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.timeout=5000] - Default timeout per command (ms)
   */
  constructor(options = {}) {
    super();

    /** @private */
    this._timeout = options.timeout || DEFAULT_TIMEOUT_MS;

    /** @private {Object|null} SerialPort instance */
    this._port = null;

    /** @private {boolean} */
    this._connected = false;

    /**
     * Buffer สำหรับสะสม data ที่รับมาจนกว่าจะเจอ TERMINATOR
     * @private {string}
     */
    this._buffer = '';

    /** @private {Function|null} */
    this._pendingResolve = null;

    /** @private {Function|null} */
    this._pendingReject = null;

    /** @private {NodeJS.Timeout|null} */
    this._pendingTimer = null;

    /** @private {boolean} */
    this._pendingIsMultiLine = false;

    /** @private {string} */
    this._path = '';

    /** @private {number} */
    this._baudRate = DEFAULT_BAUD_RATE;
  }

  /**
   * เชื่อมต่อกับ PBX ผ่าน พอร์ต LAN ของPBX.
   *
   * @param {string} path - Serial port path (e.g. '/dev/ttyUSB0', 'COM3')
   * @param {number} [baudRate=9600] - Baud rate
   * @param {Object} [serialOptions] - Additional options passed to SerialPort constructor
   * @param {number} [serialOptions.dataBits=8]
   * @param {number} [serialOptions.stopBits=1]
   * @param {string} [serialOptions.parity='none']
   * @returns {Promise<void>} Resolves เมื่อ port เปิดสำเร็จ
   * @throws {Error} เมื่อเปิด port ไม่สำเร็จ
   */
  connect(path, baudRate, serialOptions = {}) {
    return new Promise((resolve, reject) => {
      if (this._connected && this._port) {
        resolve();
        return;
      }

      this._path = path;
      this._baudRate = baudRate || DEFAULT_BAUD_RATE;
      this._buffer = '';
      this._clearPending();

      // Lazy-load serialport เพื่อไม่ให้ crash บน platform ที่ไม่มี native binding
      let SerialPort;
      try {
        ({ SerialPort } = require('serialport'));
      } catch (err) {
        reject(new Error(
          `Cannot load 'serialport' library: ${err.message}. ` +
          'Make sure serialport is installed: npm install serialport'
        ));
        return;
      }

      this._port = new SerialPort({
        path: this._path,
        baudRate: this._baudRate,
        dataBits: serialOptions.dataBits || 8,
        stopBits: serialOptions.stopBits || 1,
        parity: serialOptions.parity || 'none',
        // เปิด port ทันที
        autoOpen: false,
      });

      // ── Open port ──
      this._port.open((err) => {
        if (err) {
          this._port = null;
          reject(new Error(`Failed to open serial port ${path}: ${err.message}`));
          return;
        }

        this._connected = true;

        /**
         * เมื่อเปิด serial port สำเร็จ
         * @event SerialTransport#connected
         * @type {Object}
         * @property {string} path
         * @property {number} baudRate
         */
        this.emit('connected', { path: this._path, baudRate: this._baudRate });
        resolve();
      });

      // ── Data handler — ASCII text mode ──
      this._port.on('data', (chunk) => {
        this._onData(chunk);
      });

      // ── Error handler ──
      this._port.on('error', (err) => {
        /**
         * เมื่อเกิด error กับ serial port
         * @event SerialTransport#error
         * @type {Error}
         */
        this.emit('error', err);

        if (this._pendingReject) {
          this._pendingReject(err);
          this._clearPending();
        }
      });

      // ── Close handler ──
      this._port.on('close', () => {
        this._connected = false;

        /**
         * เมื่อ serial port ถูกปิด
         * @event SerialTransport#disconnected
         * @type {Object}
         * @property {string} path
         */
        this.emit('disconnected', { path: this._path });

        if (this._pendingReject) {
          this._pendingReject(new Error('Serial port closed while waiting for response'));
          this._clearPending();
        }
      });
    });
  }

  /**
   * ส่งคำสั่งไปยัง PBX ผ่าน serial และรอ response.
   * ใช้ command-response pattern — ส่งได้ทีละ 1 คำสั่ง.
   *
   * @param {string} command - Raw command string (ต้องรวม TERMINATOR แล้ว)
   * @param {number} [timeout] - Override timeout สำหรับคำสั่งนี้ (ms)
   * @param {boolean} [isMultiLine=false] - กำหนดว่าต้องการสืบค้นแบบหลายบรรทัดจนเจอ ==ACKW หรือไม่
   * @returns {Promise<string>} Raw response string จาก PBX
   * @throws {Error} เมื่อไม่ได้เชื่อมต่อ, timeout, หรือ port error
   */
  send(command, timeout, isMultiLine = false) {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this._port) {
        reject(new Error('Serial transport is not connected'));
        return;
      }

      if (this._pendingResolve) {
        reject(new Error('Another command is already pending — PBX uses sequential command-response'));
        return;
      }

      const cmdTimeout = timeout || this._timeout;

      this._pendingIsMultiLine = isMultiLine;

      this._pendingResolve = resolve;
      this._pendingReject = reject;

      // Timeout timer
      this._pendingTimer = setTimeout(() => {
        const err = new Error(`Command timeout (${cmdTimeout}ms): ${command.replace(/\r?\n/g, '')}`);
        if (this._pendingReject) {
          this._pendingReject(err);
          this._clearPending();
        }
      }, cmdTimeout);

      // Write command as ASCII text
      this._port.write(command, 'ascii', (err) => {
        if (err) {
          this._clearPending();
          reject(new Error(`Serial write error: ${err.message}`));
          return;
        }

        // Drain to ensure data is flushed to hardware
        this._port.drain((drainErr) => {
          if (drainErr) {
            // Non-fatal — data was written, drain just ensures flush
            this.emit('error', new Error(`Serial drain warning: ${drainErr.message}`));
          }
        });
      });
    });
  }

  /**
   * ปิด serial port อย่างสุภาพ.
   *
   * @returns {Promise<void>}
   */
  disconnect() {
    return new Promise((resolve) => {
      this._clearPending();

      if (!this._port) {
        this._connected = false;
        resolve();
        return;
      }

      if (this._connected && this._port.isOpen) {
        this._port.close((err) => {
          if (err) {
            // Force cleanup even if close fails
            this.emit('error', new Error(`Serial close error: ${err.message}`));
          }
          this._port = null;
          this._connected = false;
          resolve();
        });
      } else {
        this._port = null;
        this._connected = false;
        resolve();
      }
    });
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อ.
   *
   * @returns {boolean} true ถ้ายังเชื่อมต่ออยู่
   */
  isConnected() {
    return this._connected && this._port !== null;
  }

  /**
   * Internal: จัดการ data ที่รับมาจาก serial port.
   * Buffer จนกว่าจะเจอ \r\n แล้ว resolve pending command.
   *
   * @private
   * @param {Buffer} chunk - Raw data chunk จาก serial port
   */
   _onData(chunk) {
    // Decode as ASCII text
    this._buffer += chunk.toString('ascii');

    /**
     * Raw data received จาก PBX
     * @event SerialTransport#data
     * @type {string}
     */
    this.emit('data', chunk.toString('ascii'));

    if (this._pendingIsMultiLine) {
      // สำหรับคำสั่ง Multi-line (เช่น PWER=ALL) เราจะรอจนกว่าจะพบ ==ACKW\r\n หรือ ==NACK\r\n
      const ackwIdx = this._buffer.indexOf(`==ACKW${TERMINATOR}`);
      const nackIdx = this._buffer.indexOf(`==NACK${TERMINATOR}`);
      
      if (ackwIdx !== -1) {
        const response = this._buffer.substring(0, ackwIdx + `==ACKW${TERMINATOR}`.length);
        this._buffer = this._buffer.substring(ackwIdx + `==ACKW${TERMINATOR}`.length);
        if (this._pendingResolve) {
          const resolve = this._pendingResolve;
          this._clearPending();
          resolve(response);
        }
      } else if (nackIdx !== -1) {
        const response = this._buffer.substring(0, nackIdx + `==NACK${TERMINATOR}`.length);
        this._buffer = this._buffer.substring(nackIdx + `==NACK${TERMINATOR}`.length);
        if (this._pendingResolve) {
          const resolve = this._pendingResolve;
          this._clearPending();
          resolve(response);
        }
      }
      return;
    }

    // ตรวจหา TERMINATOR ใน buffer สำหรับคำสั่งบรรทัดเดี่ยวปกติ
    let terminatorIdx = this._buffer.indexOf(TERMINATOR);

    while (terminatorIdx !== -1) {
      const response = this._buffer.substring(0, terminatorIdx + TERMINATOR.length);
      this._buffer = this._buffer.substring(terminatorIdx + TERMINATOR.length);

      if (this._pendingResolve) {
        const resolve = this._pendingResolve;
        this._clearPending();
        resolve(response);
      }

      terminatorIdx = this._buffer.indexOf(TERMINATOR);
    }
  }

  /**
   * Internal: เคลียร์ pending state ทั้งหมด.
   *
   * @private
   */
  _clearPending() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    this._pendingResolve = null;
    this._pendingReject = null;
    this._pendingIsMultiLine = false;
  }
}

module.exports = { SerialTransport, DEFAULT_BAUD_RATE, DEFAULT_TIMEOUT_MS };
