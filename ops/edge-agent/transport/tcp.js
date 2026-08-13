'use strict';

/**
 * @file transport/tcp.js — TCP/Telnet Transport for Phonik PBX
 *
 * ใช้ Node.js built-in `net` module สำหรับเชื่อมต่อกับ PBX ผ่าน TCP/Telnet.
 * รองรับ data buffering (รอ \r\n terminator), command timeout,
 * และ EventEmitter events สำหรับ lifecycle management.
 *
 * Interface เหมือนกับ SerialTransport เพื่อให้ swap ได้โดย connector ไม่ต้องเปลี่ยนโค้ด.
 *
 * @module pbx-connector/transport/tcp
 * @author Hotel ECS Integration Team
 */

const net = require('net');
const { EventEmitter } = require('events');
const { TERMINATOR } = require('../protocol');

/**
 * Default command timeout in milliseconds.
 * ถ้า PBX ไม่ตอบกลับภายในเวลานี้ Promise จะ reject
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * TCP/Telnet Transport สำหรับสื่อสารกับ Phonik PBX.
 *
 * @extends EventEmitter
 * @fires TcpTransport#connected
 * @fires TcpTransport#disconnected
 * @fires TcpTransport#error
 * @fires TcpTransport#data
 *
 * @example
 * const tcp = new TcpTransport();
 * await tcp.connect('192.168.1.100', 23);
 * const response = await tcp.send('..VERS=\r\n');
 * console.log(response); // '=>VERS=DX-COMPACT V5.Super Diamond-32C\r\n'
 * await tcp.disconnect();
 */
class TcpTransport extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.timeout=5000] - Default timeout per command (ms)
   */
  constructor(options = {}) {
    super();

    /** @private */
    this._timeout = options.timeout || DEFAULT_TIMEOUT_MS;

    /** @private {net.Socket|null} */
    this._socket = null;

    /** @private {boolean} */
    this._connected = false;

    /**
     * Buffer สำหรับสะสม data ที่รับมาจนกว่าจะเจอ TERMINATOR
     * @private {string}
     */
    this._buffer = '';

    /**
     * Callback สำหรับ pending send() — มีได้ครั้งละ 1 คำสั่ง (command-response protocol)
     * @private {Function|null}
     */
    this._pendingResolve = null;

    /** @private {Function|null} */
    this._pendingReject = null;

    /** @private {NodeJS.Timeout|null} */
    this._pendingTimer = null;

    /** @private {boolean} */
    this._pendingIsMultiLine = false;

    /** @private {string} */
    this._host = '';

    /** @private {number} */
    this._port = 0;
  }

  /**
   * เชื่อมต่อกับ PBX ผ่าน TCP/Telnet.
   *
   * @param {string} host - IP address หรือ hostname ของ PBX
   * @param {number} port - TCP port (ปกติ Telnet = 23)
   * @returns {Promise<void>} Resolves เมื่อเชื่อมต่อสำเร็จ
   * @throws {Error} เมื่อเชื่อมต่อไม่สำเร็จ
   */
  connect(host, port) {
    return new Promise((resolve, reject) => {
      if (this._connected && this._socket) {
        resolve();
        return;
      }

      this._host = host;
      this._port = port;
      this._buffer = '';
      this._clearPending();

      this._socket = new net.Socket();

      // ── Connection timeout ──
      const connectTimer = setTimeout(() => {
        if (this._socket) {
          this._socket.destroy();
        }
        reject(new Error(`TCP connection timeout: ${host}:${port} (${this._timeout}ms)`));
      }, this._timeout);

      // ── Connected ──
      this._socket.once('connect', () => {
        clearTimeout(connectTimer);
        this._connected = true;

        // รอรับข้อความต้อนรับ (Welcome Banner) จากระบบแลน/Telnet ก่อนเชื่อมต่อจริง
        const bannerTimer = setTimeout(() => {
          if (this._socket) {
            this._socket.removeListener('data', onWelcomeData);
            this._socket.on('data', (chunk) => this._onData(chunk));
          }
          this.emit('connected', { host, port });
          resolve();
        }, 500); // หน่วงรอรับแบนเนอร์สูงสุด 500ms

        const onWelcomeData = (chunk) => {
          const str = chunk.toString('ascii');
          // หากข้อความที่ได้รับมีคำบ่งชี้ว่าคือระบบ Telnet/PBX ให้ละทิ้งแล้วเข้าสู่โหมดทำงานปกติทันที
          if (str.includes('Telnet') || str.includes('Phonik') || str.includes('PABX') || str.includes('system')) {
            clearTimeout(bannerTimer);
            if (this._socket) {
              this._socket.removeListener('data', onWelcomeData);
              this._socket.on('data', (chunk) => this._onData(chunk));
            }
            this.emit('connected', { host, port });
            resolve();
          } else {
            // กรณีเป็นข้อมูลชุดอื่น ให้เข้าสู่กระบวนการปกติและส่งต่อข้อมูลให้ประมวลผลทันที
            clearTimeout(bannerTimer);
            if (this._socket) {
              this._socket.removeListener('data', onWelcomeData);
              this._socket.on('data', (chunk) => this._onData(chunk));
            }
            this.emit('connected', { host, port });
            resolve();
            this._onData(chunk);
          }
        };

        this._socket.on('data', onWelcomeData);
      });

      // ── Error handler ──
      this._socket.on('error', (err) => {
        clearTimeout(connectTimer);

        /**
         * เมื่อเกิด error กับ TCP socket
         * @event TcpTransport#error
         * @type {Error}
         */
        this.emit('error', err);

        // ถ้ายัง pending อยู่ → reject มัน
        if (this._pendingReject) {
          this._pendingReject(err);
          this._clearPending();
        }
      });

      // ── Close handler ──
      this._socket.on('close', (hadError) => {
        this._connected = false;

        /**
         * เมื่อ TCP connection ถูกปิด
         * @event TcpTransport#disconnected
         * @type {Object}
         * @property {boolean} hadError
         */
        this.emit('disconnected', { hadError });

        // ถ้ายัง pending อยู่ → reject
        if (this._pendingReject) {
          this._pendingReject(new Error('TCP connection closed while waiting for response'));
          this._clearPending();
        }
      });

      this._socket.connect(port, host);
    });
  }

  /**
   * ส่งคำสั่งไปยัง PBX และรอ response.
   * ใช้ command-response pattern — ส่งได้ทีละ 1 คำสั่ง.
   *
   * @param {string} command - Raw command string (ต้องรวม TERMINATOR แล้ว)
   * @param {number} [timeout] - Override timeout สำหรับคำสั่งนี้ (ms)
   * @param {boolean} [isMultiLine=false] - กำหนดว่าต้องการสืบค้นแบบหลายบรรทัดจนเจอ ==ACKW หรือไม่
   * @returns {Promise<string>} Raw response string จาก PBX
   * @throws {Error} เมื่อไม่ได้เชื่อมต่อ, timeout, หรือ socket error
   */
  send(command, timeout, isMultiLine = false) {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this._socket) {
        reject(new Error('TCP transport is not connected'));
        return;
      }

      if (this._pendingResolve) {
        reject(new Error('Another command is already pending — PBX uses sequential command-response'));
        return;
      }

      const cmdTimeout = timeout || this._timeout;

      this._pendingIsMultiLine = isMultiLine;

      // Set up pending response handler
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

      // Write command to socket
      this._socket.write(command, 'ascii', (err) => {
        if (err) {
          this._clearPending();
          reject(err);
        }
      });
    });
  }

  /**
   * ตัดการเชื่อมต่อ TCP อย่างสุภาพ.
   *
   * @returns {Promise<void>}
   */
  disconnect() {
    return new Promise((resolve) => {
      this._clearPending();

      if (!this._socket) {
        this._connected = false;
        resolve();
        return;
      }

      // ถ้าเชื่อมต่อยังอยู่ → end gracefully
      if (this._connected) {
        this._socket.once('close', () => {
          this._socket = null;
          this._connected = false;
          resolve();
        });
        this._socket.end();

        // Force destroy ถ้า end ไม่สำเร็จภายใน 2s
        setTimeout(() => {
          if (this._socket) {
            this._socket.destroy();
            this._socket = null;
            this._connected = false;
            resolve();
          }
        }, 2000);
      } else {
        this._socket.destroy();
        this._socket = null;
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
    return this._connected && this._socket !== null;
  }

  /**
   * Internal: จัดการ data ที่รับมาจาก socket.
   * Buffer จนกว่าจะเจอ \r\n แล้ว resolve pending command.
   *
   * @private
   * @param {Buffer} chunk - Raw data chunk จาก socket
   */
   _onData(chunk) {
    this._buffer += chunk.toString('ascii');

    /**
     * Raw data received จาก PBX
     * @event TcpTransport#data
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
      // ตัด response ออกมา (รวม TERMINATOR)
      const response = this._buffer.substring(0, terminatorIdx + TERMINATOR.length);
      this._buffer = this._buffer.substring(terminatorIdx + TERMINATOR.length);

      // Resolve pending command ถ้ามี
      if (this._pendingResolve) {
        const resolve = this._pendingResolve;
        this._clearPending();
        resolve(response);
      }

      // ตรวจหา TERMINATOR ถัดไป (กรณี PBX ส่ง response หลายบรรทัดในครั้งเดียว)
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

module.exports = { TcpTransport, DEFAULT_TIMEOUT_MS };
