'use strict';

/**
 * @file state_store.js — Cloud Run Session & Room State Store
 *
 * เก็บสถานะห้องพัก (room state) และสถานะของคำสั่งแบบ Asynchronous
 * (session state machine) สำหรับสถาปัตยกรรม Cloud-to-Edge Bridge.
 *
 * State Machine ของ Session:
 *   PENDING_RELAY ──(Edge ยืนยันสำเร็จ)──▶ SUCCESS
 *   PENDING_RELAY ──(Edge รายงาน error)──▶ FAILED
 *   PENDING_RELAY ──(หมดเวลา timeout)────▶ TIMEOUT
 *
 * หมายเหตุด้าน Persistence:
 *   - ค่าเริ่มต้นใช้ In-Memory (เหมาะกับ Cloud Run แบบ Stateless)
 *   - ตั้ง `STATE_FILE` เพื่อเปิดการ persist ลงไฟล์ JSON (สำหรับ Dev/Local)
 *   - ฐานข้อมูล SQLite ที่ใช้งานถาวรอยู่ที่ `api/db.js` (Monolith Backend)
 *
 * @module cloudrun/state_store
 * @author Hotel ECS Integration Team
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────

/** @readonly @enum {string} */
const SESSION_STATUS = Object.freeze({
  PENDING_RELAY: 'PENDING_RELAY',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
});

// ─── StateStore Class ─────────────────────────────────────────────────────────

/**
 * Room + Session state store พร้อม EventEmitter notify.
 *
 * @fires StateStore#room_update    - เมื่อ room state เปลี่ยน
 * @fires StateStore#session_update - เมื่อ session state เปลี่ยน
 */
class StateStore extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {string} [options.stateFile='']      - Path ไฟล์ JSON สำหรับ persist (ว่าง = in-memory)
   * @param {number} [options.sessionTimeoutMs=30000] - เวลาหมดอายุของ session ที่ค้าง PENDING
   */
  constructor({ stateFile = '', sessionTimeoutMs = 30000 } = {}) {
    super();

    /** @type {Object<string, Object>} roomNo -> room state */
    this.rooms = {};

    /** @type {Object<string, Object>} sessionId -> session state */
    this.sessions = {};

    /** @type {string} */
    this.stateFile = stateFile;

    /** @type {number} */
    this.sessionTimeoutMs = sessionTimeoutMs;

    /** @private {NodeJS.Timeout|null} */
    this._sweepTimer = null;

    this._loadFromFile();
  }

  // ─── Persistence (optional, JSON file) ─────────────────────────────────────

  /**
   * โหลดสถานะจากไฟล์ JSON (ถ้ากำหนด STATE_FILE ไว้).
   * @private
   */
  _loadFromFile() {
    if (!this.stateFile) return;

    try {
      const full = path.resolve(this.stateFile);
      if (!fs.existsSync(full)) return;

      const raw = fs.readFileSync(full, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        this.rooms = data.rooms || {};
        this.sessions = data.sessions || {};
        console.log(`[StateStore] ✅ Loaded state from ${full} (${Object.keys(this.rooms).length} rooms)`);
      }
    } catch (err) {
      console.warn(`[StateStore] ⚠️ Failed to load state file: ${err.message}`);
    }
  }

  /**
   * บันทึกสถานะลงไฟล์ JSON (fire-and-forget, กัน throw).
   * @private
   */
  _persist() {
    if (!this.stateFile) return;

    try {
      const full = path.resolve(this.stateFile);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const data = JSON.stringify({ rooms: this.rooms, sessions: this.sessions }, null, 2);
      fs.writeFileSync(full, data, 'utf-8');
    } catch (err) {
      console.warn(`[StateStore] ⚠️ Failed to persist state file: ${err.message}`);
    }
  }

  // ─── Room State ─────────────────────────────────────────────────────────────

  /**
   * อัปเดตสถานะห้องพัก (merge patch).
   * @param {string|number} roomNo - หมายเลขห้อง
   * @param {Object} patch - ค่าที่ต้องการอัปเดต
   * @returns {Object} สถานะห้องล่าสุด
   */
  setRoom(roomNo, patch = {}) {
    const key = String(roomNo);
    const prev = this.rooms[key] || {};
    const next = {
      ...prev,
      ...patch,
      lastUpdated: new Date().toISOString(),
    };
    this.rooms[key] = next;
    this._persist();

    /** @event StateStore#room_update */
    this.emit('room_update', { roomNo: key, state: next });
    return next;
  }

  /**
   * อ่านสถานะห้องพัก.
   * @param {string|number} roomNo
   * @returns {Object}
   */
  getRoom(roomNo) {
    return this.rooms[String(roomNo)] || { power: 'unknown', note: 'No data yet' };
  }

  // ─── Session State Machine ──────────────────────────────────────────────────

  /**
   * สร้าง session ใหม่ในสถานะ PENDING_RELAY.
   *
   * @param {Object} opts
   * @param {string|number} opts.roomNumber - หมายเลขห้อง
   * @param {'ON'|'OFF'} opts.command - คำสั่งที่สั่งไป
   * @param {string} [opts.requestedBy] - ผู้ร้องขอ
   * @param {Object} [opts.meta] - ข้อมูลประกอบ (guestName, transactionId, ฯลฯ)
   * @returns {Object} session object (รวม sessionId)
   */
  createSession({ roomNumber, command, requestedBy = 'guest', meta = {} }) {
    const sessionId = randomUUID();
    const session = {
      sessionId,
      roomNumber: String(roomNumber),
      command: String(command || '').toUpperCase(),
      status: SESSION_STATUS.PENDING_RELAY,
      requestedBy,
      meta,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.sessions[sessionId] = session;

    // อัปเดต room state ให้รู้ว่ามีคำสั่งค้างอยู่
    this.setRoom(roomNumber, {
      power: session.command === 'ON' ? 'pending_on' : 'pending_off',
      lastSessionId: sessionId,
      lastCommand: session.command,
    });

    /** @event StateStore#session_update */
    this.emit('session_update', { ...session });
    return { ...session };
  }

  /**
   * อัปเดตสถานะ session (SUCCESS/FAILED/TIMEOUT).
   * @param {string} sessionId
   * @param {string} status - ค่าจาก SESSION_STATUS
   * @param {Object} [data] - ข้อมูลเพิ่มเติม (result, error, power ฯลฯ)
   * @returns {Object|null} session ล่าสุด หรือ null ถ้าไม่พบ
   */
  updateSession(sessionId, status, data = {}) {
    const session = this.sessions[sessionId];
    if (!session) return null;

    session.status = status;
    session.updatedAt = new Date().toISOString();
    Object.assign(session, data);
    this._persist();

    /** @event StateStore#session_update */
    this.emit('session_update', { ...session });
    return { ...session };
  }

  /**
   * อ่าน session.
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    return this.sessions[sessionId] ? { ...this.sessions[sessionId] } : null;
  }

  // ─── Stale Session Sweeper (Self-Healing) ──────────────────────────────────

  /**
   * เริ่มตัวกวาด session ที่ค้าง PENDING เกินเวลากำหนด.
   * @param {number} [intervalMs=5000]
   */
  startSweeper(intervalMs = 5000) {
    if (this._sweepTimer) return;
    this._sweepTimer = setInterval(() => this.sweepStale(), intervalMs);
    if (this._sweepTimer.unref) this._sweepTimer.unref();
  }

  /**
   * ตรวจสอบและทำเครื่องหมาย TIMEOUT ให้ session ที่ค้างนานเกินกำหนด.
   */
  sweepStale() {
    const now = Date.now();
    for (const [id, s] of Object.entries(this.sessions)) {
      if (s.status !== SESSION_STATUS.PENDING_RELAY) continue;
      const age = now - new Date(s.updatedAt).getTime();
      if (age > this.sessionTimeoutMs) {
        this.updateSession(id, SESSION_STATUS.TIMEOUT, {
          error: 'Session timed out waiting for Edge verification',
        });
      }
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { StateStore, SESSION_STATUS };
