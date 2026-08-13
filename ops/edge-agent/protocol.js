'use strict';

/**
 * @file protocol.js — Phonik PBX ASCII Protocol Engine (Pure Functions)
 *
 * โปรโตคอลของ Phonik PBX ใช้ text-based ASCII ผ่าน Telnet/TCP หรือ พอร์ต LAN ของPBX
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  Command format:  ..COMMAND\r\n                        │
 * │  Response format:  =>RESULT\r\n   or   =NACK\r\n       │
 * └─────────────────────────────────────────────────────────┘
 *
 * ทุก function ใน module นี้เป็น **pure function** — ไม่มี side effect,
 * ไม่มี I/O, ไม่มี state. ใช้ได้ทั้ง TCP transport และ Serial transport.
 *
 * @module pbx-connector/protocol
 * @author Hotel ECS Integration Team
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Line terminator used by Phonik PBX protocol.
 * ทุกคำสั่งและ response ต้องจบด้วย CR+LF
 * @constant {string}
 */
const TERMINATOR = '\r\n';

/**
 * Command prefix — สองจุด (..) นำหน้าทุกคำสั่งที่ส่งไป PBX
 * @constant {string}
 */
const CMD_PREFIX = '..';

/**
 * Response prefix — PBX ตอบกลับด้วย == นำหน้า
 * @constant {string}
 */
const RESP_PREFIX = '==';

/**
 * NACK response — PBX ส่งกลับเมื่อคำสั่งผิดพลาดหรือไม่รู้จัก
 * @constant {string}
 */
const NACK = '==NACK';

/**
 * Maximum characters allowed for guest name on PBX
 * @constant {number}
 */
const MAX_NAME_LENGTH = 16;

/**
 * Room status enum — ค่าสถานะห้องพักที่ PBX รองรับ
 * @readonly
 * @enum {number}
 */
const ROOM_STATUS = Object.freeze({
  /** ปิด — ตัดไฟห้องพัก (Check-out / ว่าง) */
  OFF: 0,
  /** เปิด — จ่ายไฟห้องพัก (Check-in / มีแขก) */
  ON: 1,
  /** ซ่อมบำรุง */
  MAINTENANCE: 2,
  /** Out of Order — ห้ามใช้งาน */
  OUT_OF_ORDER: 3,
});

/**
 * Reverse lookup: status number → human-readable label
 * @readonly
 * @type {Object<number, string>}
 */
const ROOM_STATUS_LABEL = Object.freeze({
  [ROOM_STATUS.OFF]: 'OFF',
  [ROOM_STATUS.ON]: 'ON',
  [ROOM_STATUS.MAINTENANCE]: 'MAINTENANCE',
  [ROOM_STATUS.OUT_OF_ORDER]: 'OUT_OF_ORDER',
});

/**
 * Response type enum — ประเภทของ response ที่ parse ออกมาได้
 * @readonly
 * @enum {string}
 */
const RESPONSE_TYPE = Object.freeze({
  ROOM: 'ROOM',
  POWER: 'POWER',
  NAME: 'NAME',
  VERSION: 'VERSION',
  STOP: 'STOP',
  WAKE: 'WAKE',
  LOCK: 'LOCK',
  NACK: 'NACK',
  UNKNOWN: 'UNKNOWN',
});

// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Validate and normalize room number to 4-digit string.
 * PBX ใช้เลขห้อง 4 หลัก (เช่น 0101, 0203)
 *
 * @param {string|number} room - Room number (e.g. 101, '0101', '101')
 * @returns {string} 4-digit zero-padded room string
 * @throws {Error} ถ้า room ไม่ถูกต้อง
 */
function normalizeRoom(room) {
  if (room === null || room === undefined) {
    throw new Error('Room number is required');
  }
  let str = String(room).trim();
  if (str.startsWith('http') || str.includes('?')) {
    try {
      const match = str.match(/[?&]room=(\d+)/);
      if (match) {
        str = match[1];
      } else {
        const url = new URL(str);
        str = url.searchParams.get('room') || str;
      }
    } catch (e) {
      const match = str.match(/[?&]room=(\d+)/);
      if (match) str = match[1];
    }
  }
  if (!/^\d{1,4}$/.test(str)) {
    throw new Error(`Invalid room number: "${room}" — must be 1-4 digits`);
  }
  return str.padStart(4, '0');
}

/**
 * Validate room status value.
 *
 * @param {number} status - Room status (0-3)
 * @throws {Error} ถ้า status ไม่อยู่ในช่วง 0-3
 */
function validateStatus(status) {
  if (typeof status !== 'number' || status < 0 || status > 3) {
    throw new Error(`Invalid room status: ${status} — must be 0, 1, 2, or 3`);
  }
}

/**
 * Validate and sanitize guest name for PBX.
 *
 * @param {string} name - Guest name
 * @returns {string} Sanitized name (max 16 chars, ASCII-safe)
 * @throws {Error} ถ้า name ว่าง
 */
function sanitizeName(name, room = '') {
  if (!name || typeof name !== 'string') {
    throw new Error('Guest name is required and must be a string');
  }
  // Trim and strip non-printable ASCII characters (keep space and standard ASCII)
  let cleanName = name.replace(/[^\x20-\x7E]/g, '').trim();
  if (!cleanName) {
    cleanName = room ? `Guest ${room}` : 'Guest';
  }
  return cleanName.substring(0, MAX_NAME_LENGTH);
}

// ─── Command Builders ─────────────────────────────────────────────────────────
// ทุก builder return string พร้อม TERMINATOR — พร้อมส่งผ่าน transport ได้เลย

/**
 * Build command to **set** room status (Check-in/Check-out).
 *
 * @example
 * buildSetRoom(101, ROOM_STATUS.ON)   // => '..ROOM0101=1\r\n'
 * buildSetRoom('0203', ROOM_STATUS.OFF) // => '..ROOM0203=0\r\n'
 *
 * @param {string|number} room - Room number
 * @param {number} status - Status value from ROOM_STATUS enum (0-3)
 * @returns {string} Complete command string with terminator
 */
/**
 * Map room number to Extension number on the PBX.
 * ห้อง 101-106 แผนผังในตู้สาขา Phonik จะตรงกับ Extension 1017-1022 (Offset +916)
 *
 * @param {string|number} room - Room number
 * @returns {string} Extension string
 */
function getExtensionForRoom(room) {
  const r = parseInt(String(room).replace(/^0+/, ''), 10);
  if (r >= 101 && r <= 106) {
    return String(r + 916);
  }
  return String(room).replace(/^0+/, '');
}

/**
 * Build command to **set** room status (Check-in/Check-out).
 * ใช้คำสั่ง PWER ในการควบคุมไฟฟ้า (PWER101=1 เปิด, PWER101=0 ปิด)
 *
 * @example
 * buildSetRoom(101, ROOM_STATUS.ON)   // => '..PWER101=1\r\n'
 * buildSetRoom('0203', ROOM_STATUS.OFF) // => '..PWER203=0\r\n'
 *
 * @param {string|number} room - Room number
 * @param {number} status - Status value from ROOM_STATUS enum (0-3)
 * @param {number} [days=1] - Number of days (duration)
 * @returns {string} Complete command string with terminator
 */
function buildSetRoom(room, status, days = 1) {
  const cleanRoom = String(room).replace(/^0+/, '') || '0';
  validateStatus(status);
  
  const powerValue = status === ROOM_STATUS.ON ? 1 : 0;
  
  return `${CMD_PREFIX}PWER${cleanRoom}=${powerValue}${TERMINATOR}`;
}

/**
 * Build command to **read** current room status.
 * การอ่านสถานะไฟฟ้าจะส่งคำสั่งแบบกลุ่ม ..PWER=ALL เสมอเนื่องจากตู้ไม่รองรับการสืบค้นเดี่ยว
 *
 * @example
 * buildGetRoom(101) // => '..PWER=ALL\r\n'
 *
 * @param {string|number} room - Room number
 * @returns {string} Complete command string with terminator
 */
function buildGetRoom(room) {
  return `${CMD_PREFIX}PWER=ALL${TERMINATOR}`;
}

/**
 * Build command to **set** guest name for a room.
 * บันทึกชื่อแขกจะใช้คำสั่ง ROOM ผ่าน Extension ของห้องพักนั้น (เช่น ..ROOM1017=GuestName)
 *
 * @example
 * buildSetName(101, 'John Doe') // => '..ROOM1017=John Doe\r\n'
 *
 * @param {string|number} room - Room number
 * @param {string} name - Guest name (max 16 characters)
 * @returns {string} Complete command string with terminator
 */
function buildSetName(room, name) {
  const ext = getExtensionForRoom(room);
  const safeName = sanitizeName(name, ext);
  return `${CMD_PREFIX}ROOM${ext}=${safeName}${TERMINATOR}`;
}

/**
 * Build command to **read** guest name for a room.
 * อ่านชื่อแขกผ่าน ROOM บน Extension (เช่น ..ROOM1017=)
 *
 * @example
 * buildGetName(101) // => '..ROOM1017=\r\n'
 *
 * @param {string|number} room - Room number
 * @returns {string} Complete command string with terminator
 */
function buildGetName(room) {
  const ext = getExtensionForRoom(room);
  return `${CMD_PREFIX}ROOM${ext}=${TERMINATOR}`;
}


/**
 * Build command to **set** terminal command mode (tcmd=1).
 * จำเป็นต้องเรียกคำสั่งนี้ก่อนเพื่อเริ่มโหมดคำสั่ง
 *
 * @returns {string} Complete command string with terminator
 */
function buildAuthTcmd() {
  return `${CMD_PREFIX}tcmd=1${TERMINATOR}`;
}

/**
 * Build command to **authenticate** via password.
 *
 * @param {string} password - The PBX password (default: 1234)
 * @returns {string} Complete command string with terminator
 */
function buildAuthPass(password = '1234') {
  return `${CMD_PREFIX}PASS=${password}${TERMINATOR}`;
}

/**
 * Build command to **read** PBX firmware version.
 *
 * @example
 * buildGetVersion() // => '..VERS=\r\n'
 *
 * @returns {string} Complete command string with terminator
 */
function buildGetVersion() {
  return `${CMD_PREFIX}VERS=${TERMINATOR}`;
}

/**
 * Build command to **disconnect** from PBX gracefully.
 *
 * @example
 * buildStop() // => '..STOP\r\n'
 *
 * @returns {string} Complete command string with terminator
 */
function buildStop() {
  return `${CMD_PREFIX}STOP${TERMINATOR}`;
}

/**
 * Build **heartbeat/ping** command.
 * ใช้ VERS เป็น ping เพราะเป็น read-only ไม่มี side effect ต่อ PBX state
 *
 * @example
 * buildPing() // => '..VERS=\r\n'
 *
 * @returns {string} Complete command string with terminator
 */
function buildPing() {
  return buildGetVersion();
}

/**
 * Build command to **set** wake-up call time for a room.
 *
 * @example
 * buildSetWake(101, '0630') // => '..WAKE0101=0630\r\n'
 *
 * @param {string|number} room - Room number
 * @param {string} time - Time in hhmm format (e.g. '0630' for 06:30)
 * @returns {string} Complete command string with terminator
 * @throws {Error} ถ้า time format ไม่ถูกต้อง
 */
function buildSetWake(room, time) {
  const ext = getExtensionForRoom(room);
  if (!/^\d{4}$/.test(time)) {
    throw new Error(`Invalid wake time: "${time}" — must be hhmm format (e.g. "0630")`);
  }
  const hh = parseInt(time.substring(0, 2), 10);
  const mm = parseInt(time.substring(2, 4), 10);
  if (hh > 23 || mm > 59) {
    throw new Error(`Invalid wake time: "${time}" — hours 0-23, minutes 0-59`);
  }
  return `${CMD_PREFIX}WAKE${ext}=${time}${TERMINATOR}`;
}

/**
 * Build command to **set** room lock status.
 *
 * @example
 * buildSetLock(101, 1) // => '..LOCK1017=1\r\n'
 *
 * @param {string|number} room - Room number
 * @param {number} lockState - 0 = clear, 1 = set lock
 * @returns {string} Complete command string with terminator
 * @throws {Error} ถ้า lockState ไม่ใช่ 0 หรือ 1
 */
function buildSetLock(room, lockState) {
  const ext = getExtensionForRoom(room);
  if (lockState !== 0 && lockState !== 1) {
    throw new Error(`Invalid lock state: ${lockState} — must be 0 (clear) or 1 (set)`);
  }
  return `${CMD_PREFIX}LOCK${ext}=${lockState}${TERMINATOR}`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} ParsedResponse
 * @property {string} type     - Response type from RESPONSE_TYPE enum
 * @property {string|null} room  - Room number (4-digit string) or null
 * @property {string|null} value - Parsed value (status, name, version string, etc.)
 * @property {string} raw       - Original raw string before parsing
 * @property {boolean} error     - true if response is NACK or unparseable
 * @property {string|null} errorMessage - Human-readable error description
 */

/**
 * Parse a raw response string from PBX into a structured object.
 *
 * PBX Response formats:
 *   =>ROOMnumb=r      → room status
 *   =>NAMEnumb=name   → guest name
 *   =>VERS=version    → firmware version
 *   =>STOP            → disconnect acknowledgement
 *   =>WAKEnumb=hhmm   → wake-up time
 *   =>LOCKnumb=k      → lock status
 *   =NACK             → error / unknown command
 *
 * @example
 * parseResponse('=>ROOM0101=1')
 * // => { type: 'ROOM', room: '0101', value: '1', raw: '=>ROOM0101=1', error: false, errorMessage: null }
 *
 * parseResponse('=NACK')
 * // => { type: 'NACK', room: null, value: null, raw: '=NACK', error: true, errorMessage: 'PBX returned NACK' }
 *
 * @param {string} rawString - Raw response from PBX (may include trailing \r\n)
 * @returns {ParsedResponse} Structured response object
 */
function parseResponse(rawString) {
  // Base result object
  const result = {
    type: RESPONSE_TYPE.UNKNOWN,
    room: null,
    value: null,
    raw: rawString,
    error: false,
    errorMessage: null,
  };

  if (!rawString || typeof rawString !== 'string') {
    result.error = true;
    result.errorMessage = 'Empty or invalid response';
    return result;
  }

  // Strip terminators and whitespace
  let line = rawString.replace(/\r?\n/g, '').trim();

  // Strip leading dots (prompts) left in the buffer from PBX greetings
  line = line.replace(/^\.+/, '');

  // ── NACK ──
  if (line === NACK || line.startsWith('==NACK')) {
    result.type = RESPONSE_TYPE.NACK;
    result.error = true;
    result.errorMessage = 'PBX returned NACK — command rejected or unknown';
    const nackMatch = line.match(/^==NACK=>(.*)$/);
    if (nackMatch) {
      result.errorMessage = `PBX returned NACK for command: ${nackMatch[1]}`;
    }
    return result;
  }

  // ── Must start with == ──
  if (!line.startsWith(RESP_PREFIX)) {
    result.error = true;
    result.errorMessage = `Unexpected response format (missing "${RESP_PREFIX}" prefix): "${line}"`;
    return result;
  }

  // Strip the == prefix
  const body = line.substring(RESP_PREFIX.length);

  // ── STOP ──
  if (body === 'STOP') {
    result.type = RESPONSE_TYPE.STOP;
    result.value = 'STOP';
    return result;
  }

  // ── VERS=... ──
  if (body.startsWith('VERS=')) {
    result.type = RESPONSE_TYPE.VERSION;
    result.value = body.substring('VERS='.length);
    return result;
  }

  // ── Multi-line PWER response (e.g. from PWER=ALL) ──
  if (body.includes('PWER') && body.includes('ACKW')) {
    result.type = RESPONSE_TYPE.POWER;
    result.rooms = {};
    const matches = body.matchAll(/PWER(\d{1,4})=(on|off)/ig);
    for (const match of matches) {
      result.rooms[match[1]] = match[2].toLowerCase() === 'on' ? 'ON' : 'OFF';
    }
    return result;
  }

  // ── Multi-line RDSS response (e.g. from RDSS=ALL) ──
  if (body.includes('RDSS') && body.includes('ACKW')) {
    result.type = RESPONSE_TYPE.ROOM;
    result.rooms = {};
    const matches = body.matchAll(/RDSS(\d{1,4})=(\d+)/ig);
    for (const match of matches) {
      result.rooms[match[1]] = match[2];
    }
    return result;
  }

  // ── ROOM{1-4digits}={name/status} ──
  const roomMatch = body.match(/^ROOM(\d{1,4})=(.*)$/);
  if (roomMatch) {
    result.type = RESPONSE_TYPE.ROOM;
    result.room = roomMatch[1];
    result.value = roomMatch[2] === '0' ? '' : roomMatch[2] || '';
    return result;
  }

  // ── PWER{1-4digits}={on|off ...} (Legacy/Single PWER response) ──
  const pwerMatch = body.match(/^PWER(\d{1,4})=(on|off)(?:\s.*)?$/i);
  if (pwerMatch) {
    result.type = RESPONSE_TYPE.POWER;
    result.room = pwerMatch[1];
    result.value = pwerMatch[2].toLowerCase(); // 'on' or 'off'
    return result;
  }

  // ── NAME{1-4digits}={name} ──
  const nameMatch = body.match(/^NAME(\d{1,4})=(.*)$/);
  if (nameMatch) {
    result.type = RESPONSE_TYPE.NAME;
    result.room = nameMatch[1];
    result.value = nameMatch[2] || '';
    return result;
  }


  // ── WAKE{1-4digits}={hhmm} ──
  const wakeMatch = body.match(/^WAKE(\d{1,4})=(.*)$/);
  if (wakeMatch) {
    result.type = RESPONSE_TYPE.WAKE;
    result.room = wakeMatch[1];
    result.value = wakeMatch[2] || '';
    return result;
  }

  // ── LOCK{1-4digits}={k} ──
  const lockMatch = body.match(/^LOCK(\d{1,4})=(\d*)$/);
  if (lockMatch) {
    result.type = RESPONSE_TYPE.LOCK;
    result.room = lockMatch[1];
    result.value = lockMatch[2] || null;
    return result;
  }

  // ── Unknown but valid prefix ──
  result.error = true;
  result.errorMessage = `Unrecognized response body: "${body}"`;
  return result;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  TERMINATOR,
  CMD_PREFIX,
  RESP_PREFIX,
  NACK,
  MAX_NAME_LENGTH,
  ROOM_STATUS,
  ROOM_STATUS_LABEL,
  RESPONSE_TYPE,

  // Helpers
  normalizeRoom,

  // Command Builders
  buildAuthTcmd,
  buildAuthPass,
  buildSetRoom,
  buildGetRoom,
  buildSetName,
  buildGetName,
  buildGetVersion,
  buildStop,
  buildPing,
  buildSetWake,
  buildSetLock,

  // Parser
  parseResponse,
};

/**
 * PBXProtocolHandler Class
 * สำหรับรองรับ CCH2 Protocol โดยเฉพาะ
 */
class PBXProtocolHandler {
  static buildCheckInCommand(room) {
    return buildSetRoom(room, ROOM_STATUS.ON);
  }

  static buildCheckOutCommand(room) {
    return buildSetRoom(room, ROOM_STATUS.OFF);
  }

  static buildSetNameCommand(room, name) {
    return buildSetName(room, name);
  }

  static parse(responseStr) {
    return parseResponse(responseStr);
  }
}

module.exports.PBXProtocolHandler = PBXProtocolHandler;

