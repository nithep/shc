'use strict';

/**
 * @file queue.js — FIFO Command Queue with Safety Timeout & Metadata
 *
 * ช่วยจัดการคำสั่งแบบ Asynchronous ให้ทำงานเรียงตามลำดับก่อนหลัง (FIFO)
 * ป้องกันปัญหาสัญญาณชนกันหรือคำสั่งซ้อนทับกันเมื่อ API ได้รับ Concurrent Requests
 * พร้อมระบบ Safety Timeout เพื่อป้องกัน Deadlock เมื่อฮาร์ดแวร์ไม่ตอบสนอง
 *
 * Features:
 * - FIFO Deterministic Sequential Queue (ไม่มี Race Condition)
 * - Command Metadata (id, room, action, enqueuedAt)
 * - Drain Guard: ป้องกัน Queue Overflow (สูงสุด 50 commands)
 * - getStatus(): ดูสถานะคิวปัจจุบัน
 * - addWithTimeout(): เพิ่มคำสั่งพร้อมกำหนด Timeout ได้เอง
 * - Logging ทุก Operation ด้วย [QUEUE] prefix
 *
 * @module pbx-connector/queue
 * @author Hotel ECS Integration Team
 */

/** @constant {number} จำนวน command สูงสุดในคิว ก่อน Reject (Drain Guard) */
const MAX_QUEUE_SIZE = 50;

/** @constant {number} default timeout (ms) สำหรับแต่ละ hardware command */
const DEFAULT_TIMEOUT_MS = 5000;

/** @constant {number} ดีเลย์หลัง command เสร็จก่อนส่งอันถัดไป (ms) */
const INTER_COMMAND_DELAY_MS = 100;

/** Counter สำหรับสร้าง unique ID */
let _cmdCounter = 0;

/**
 * สร้าง Command ID ที่ไม่ซ้ำ
 * @returns {string}
 */
function _generateId() {
  _cmdCounter++;
  return `cmd-${Date.now()}-${_cmdCounter}`;
}

/**
 * ห่อหุ้มฟังก์ชันคำสั่งด้วย Safety Timeout
 *
 * @param {Function} commandFn  - ฟังก์ชันที่ส่งคำสั่งไปยังฮาร์ดแวร์ (คืนค่าเป็น Promise)
 * @param {number}   timeoutMs  - เวลาจำกัดในการรอตอบกลับ (ms)
 * @param {string}   [cmdId]    - Command ID สำหรับ Log
 * @returns {Promise<any>}
 * @throws {Error} HARDWARE_TIMEOUT เมื่อหมดเวลารอ
 */
async function executeHardwareCommand(commandFn, timeoutMs = DEFAULT_TIMEOUT_MS, cmdId = '') {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(
        `HARDWARE_TIMEOUT: PBX failed to respond within ${timeoutMs}ms (${cmdId})`
      ));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([commandFn(), timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle);
    console.error(`[QUEUE][ERROR] Safety Gate Triggered: ${error.message}`);
    throw error;
  }
}

// ─── CommandQueue Class ────────────────────────────────────────────────────────

class CommandQueue {
  constructor() {
    /**
     * @private
     * @type {Array<{
     *   id: string,
     *   room: string,
     *   action: string,
     *   enqueuedAt: string,
     *   timeoutMs: number,
     *   asyncFn: Function,
     *   resolve: Function,
     *   reject: Function
     * }>}
     */
    this._queue = [];

    /**
     * @private
     * @type {boolean}
     */
    this._running = false;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Log message มาตรฐาน
   * @param {'INFO'|'WARN'|'ERROR'} level
   * @param {string} msg
   */
  _log(level, msg) {
    const ts = new Date().toISOString();
    const out = `[QUEUE][${level}][${ts}] ${msg}`;
    if (level === 'ERROR') console.error(out);
    else if (level === 'WARN') console.warn(out);
    else console.log(out);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * เพิ่ม Async function เข้าคิว (พร้อม Metadata)
   * คำสั่งจะถูกห่อหุ้มด้วย executeHardwareCommand อัตโนมัติ
   *
   * @param {Function} asyncFn   - ฟังก์ชันที่คืนค่าเป็น Promise
   * @param {Object}  [meta]     - Metadata ของคำสั่ง
   * @param {string}  [meta.room='unknown']   - หมายเลขห้อง
   * @param {string}  [meta.action='COMMAND'] - ประเภทคำสั่ง
   * @param {number}  [timeoutMs]             - Timeout เฉพาะของ command นี้
   * @returns {Promise<any>}
   */
  add(asyncFn, meta = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return this.addWithTimeout(asyncFn, meta, timeoutMs);
  }

  /**
   * เพิ่ม command พร้อมกำหนด Timeout ได้เอง (Explicit version)
   *
   * @param {Function} asyncFn
   * @param {Object}   meta
   * @param {string}   [meta.room='unknown']
   * @param {string}   [meta.action='COMMAND']
   * @param {number}   timeoutMs
   * @returns {Promise<any>}
   */
  addWithTimeout(asyncFn, meta = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    // ── Drain Guard ──────────────────────────────────────────────────────────
    if (this._queue.length >= MAX_QUEUE_SIZE) {
      const errMsg =
        `QUEUE_OVERFLOW: Queue is full (${MAX_QUEUE_SIZE} commands). ` +
        `Cannot enqueue room=${meta.room || 'unknown'} action=${meta.action || 'COMMAND'}`;
      this._log('ERROR', errMsg);
      return Promise.reject(new Error(errMsg));
    }

    const id = _generateId();
    const room = meta.room || 'unknown';
    const action = meta.action || 'COMMAND';
    const enqueuedAt = new Date().toISOString();

    this._log('INFO', `Enqueue id=${id} room=${room} action=${action} queueSize=${this._queue.length + 1}`);

    return new Promise((resolve, reject) => {
      const wrappedFn = () => executeHardwareCommand(asyncFn, timeoutMs, id);
      this._queue.push({ id, room, action, enqueuedAt, timeoutMs, asyncFn: wrappedFn, resolve, reject });
      this._next();
    });
  }

  /**
   * รันคำสั่งลำดับถัดไปในคิว (FIFO)
   * @private
   */
  async _next() {
    if (this._running || this._queue.length === 0) return;

    this._running = true;
    const item = this._queue.shift();
    const { id, room, action, asyncFn, resolve, reject } = item;

    this._log('INFO', `Executing id=${id} room=${room} action=${action} remaining=${this._queue.length}`);

    try {
      const result = await asyncFn();
      this._log('INFO', `✅ Done id=${id} room=${room} action=${action}`);
      resolve(result);
    } catch (err) {
      this._log('ERROR', `❌ Failed id=${id} room=${room} action=${action}: ${err.message}`);
      reject(err);
    } finally {
      // Inter-command delay ป้องกัน PBX ทำงานไม่ทัน
      await new Promise(res => setTimeout(res, INTER_COMMAND_DELAY_MS));
      this._running = false;
      this._next();
    }
  }

  /**
   * ดูสถานะคิวปัจจุบัน
   * @returns {{ size: number, isRunning: boolean, items: Array<Object> }}
   */
  getStatus() {
    return {
      size: this._queue.length,
      isRunning: this._running,
      items: this._queue.map(({ id, room, action, enqueuedAt, timeoutMs }) => ({
        id, room, action, enqueuedAt, timeoutMs,
      })),
    };
  }

  /**
   * ล้างคำสั่งที่ค้างอยู่ในคิวทั้งหมดออกพร้อมแจ้ง Error
   */
  clear() {
    const count = this._queue.length;
    const error = new Error('QUEUE_CLEARED: Command queue cleared due to connection reset or disconnect');
    while (this._queue.length > 0) {
      const { id, room, reject } = this._queue.shift();
      this._log('WARN', `Clearing pending command id=${id} room=${room}`);
      reject(error);
    }
    this._running = false;
    this._log('INFO', `Queue cleared. ${count} commands discarded.`);
  }

  /**
   * จำนวนคำสั่งที่ยังคงค้างอยู่ในคิวรอการประมวลผล
   * @returns {number}
   */
  get size() {
    return this._queue.length;
  }

  /**
   * ตรวจสอบว่าคิวกำลังรันคำสั่งอยู่หรือไม่
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }
}

module.exports = { CommandQueue, executeHardwareCommand };
