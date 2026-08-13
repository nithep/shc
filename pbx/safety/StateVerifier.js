'use strict';

const { PBXProtocolHandler, RESPONSE_TYPE } = require('../protocol');

/**
 * @file StateVerifier.js — Hardware State Safety Guard
 *
 * คลาสนี้ทำหน้าที่เป็น "Safety Wrapper" รอบทุกคำสั่งที่ส่งไปยังตู้สาขา Phonik PBX
 * โดยมีขั้นตอนการตรวจสอบ 3 ระดับ:
 *
 * 1. Pre-Flight  : ตรวจสอบว่า transport พร้อมรับคำสั่งก่อนส่ง
 * 2. Execute     : ส่งคำสั่งจริงและรอรับ response พร้อม Timeout
 * 3. Post-Flight : ตรวจสอบว่า state จาก PBX ตรงกับ expectedState
 *
 * หากสถานะไม่ตรง (State Mismatch) ระบบจะทำ Self-Healing Retry อัตโนมัติ
 * สูงสุด 3 ครั้ง (Exponential Backoff: 1s → 2s → 3s)
 *
 * @module pbx-connector/safety/StateVerifier
 * @author Hotel ECS Integration Team
 */

/** @constant {number} จำนวนครั้ง Retry สูงสุด */
const DEFAULT_MAX_RETRIES = 3;

/** @constant {number} เวลาหน่วงฐาน (ms) ก่อน Retry */
const DEFAULT_RETRY_DELAY_MS = 1000;

class StateVerifier {
  /**
   * @param {number} maxRetries    - จำนวนครั้งสูงสุดที่ยอมให้ Retry (default 3)
   * @param {number} retryDelayMs - เวลาหน่วงฐาน (ms) ก่อน Retry ครั้งแรก (default 1000)
   */
  constructor(maxRetries = DEFAULT_MAX_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS) {
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * หน่วงเวลาแบบ Promise
   * @param {number} ms
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log message ด้วย prefix มาตรฐาน
   * @param {'INFO'|'WARN'|'ERROR'} level
   * @param {string} msg
   */
  _log(level, msg) {
    const ts = new Date().toISOString();
    const prefix = `[StateVerifier][${level}][${ts}]`;
    if (level === 'ERROR') {
      console.error(`${prefix} ${msg}`);
    } else if (level === 'WARN') {
      console.warn(`${prefix} ${msg}`);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }

  // ─── Pre-Flight Check ────────────────────────────────────────────────────────

  /**
   * Pre-Flight: ตรวจสอบว่า transport พร้อมก่อนส่งคำสั่ง
   * @param {Function|null} isConnectedFn - function ที่ return boolean (optional)
   * @throws {Error} PRE_FLIGHT_FAILED ถ้า transport ไม่พร้อม
   */
  async _preFlight(isConnectedFn) {
    if (!isConnectedFn) return; // ถ้าไม่ได้ inject ให้ผ่านไปเลย
    const connected = await isConnectedFn();
    if (!connected) {
      throw new Error('PRE_FLIGHT_FAILED: Transport is not connected to PBX');
    }
    this._log('INFO', 'Pre-flight check passed ✓');
  }

  // ─── Post-Flight Check ───────────────────────────────────────────────────────

  /**
   * Post-Flight: เปรียบเทียบ state จริงจาก PBX กับ expectedState
   * @param {string} rawResponse  - raw string จาก PBX
   * @param {string} expectedState - 'ON' | 'OFF' | null (null = ไม่ต้องตรวจสอบ)
   * @param {string} room          - หมายเลขห้อง (สำหรับ Log)
   * @returns {{ matched: boolean, parsed: Object }}
   */
  _postFlight(rawResponse, expectedState, room) {
    if (!expectedState) {
      return { matched: true, parsed: null };
    }

    const parsed = PBXProtocolHandler.parse(rawResponse);

    if (parsed.error || parsed.type === RESPONSE_TYPE.NACK) {
      return { matched: false, parsed };
    }

    // ตรวจสอบ state ตรงกับ expected หรือไม่
    // POWER response: parsed.value = 'on' | 'off'
    // ROOM response: parsed.value = '1' | '0'
    let actualState = null;
    if (parsed.type === RESPONSE_TYPE.POWER) {
      actualState = parsed.value?.toUpperCase() === 'ON' ? 'ON' : 'OFF';
    } else if (parsed.type === RESPONSE_TYPE.ROOM) {
      actualState = parsed.value === '1' ? 'ON' : 'OFF';
    }

    const matched = actualState === expectedState;

    if (!matched) {
      this._log('WARN',
        `Post-flight STATE MISMATCH for room ${room}: expected=${expectedState}, actual=${actualState}`
      );
    } else {
      this._log('INFO', `Post-flight check passed ✓ room=${room} state=${actualState}`);
    }

    return { matched, parsed, actualState };
  }

  // ─── Main Verify Method ──────────────────────────────────────────────────────

  /**
   * ส่งคำสั่งพร้อมระบบตรวจสอบ Pre/Post-Flight และ Self-Healing Retry
   *
   * @param {Object} options
   * @param {string}        options.room          - หมายเลขห้อง (เช่น '101')
   * @param {string}        options.action        - 'ON' | 'OFF' | 'SET_NAME' ฯลฯ (สำหรับ Log)
   * @param {'ON'|'OFF'|null} [options.expectedState] - สถานะที่คาดหวังหลังสั่ง (null = ไม่ตรวจ Post-Flight)
   * @param {Function}      options.executeFn     - async fn ที่ส่งคำสั่งและ return rawResponse string
   * @param {Function}      [options.isConnectedFn] - async fn ที่ return boolean (Pre-Flight check)
   *
   * @returns {Promise<{
   *   success: boolean,
   *   data: Object|null,
   *   room: string,
   *   action: string,
   *   attempts: number,
   *   timestamp: string,
   *   lastError?: string
   * }>}
   */
  async verify({ room, action, expectedState = null, executeFn, isConnectedFn = null }) {
    let attempts = 0;
    let lastError = null;

    this._log('INFO', `Starting verify: room=${room} action=${action} expected=${expectedState}`);

    while (attempts < this.maxRetries) {
      attempts++;
      this._log('INFO', `Attempt ${attempts}/${this.maxRetries} — room=${room}`);

      try {
        // ── Step 1: Pre-Flight Check ──────────────────────────────────────────
        await this._preFlight(isConnectedFn);

        // ── Step 2: Execute Command ───────────────────────────────────────────
        const rawResponse = await executeFn();

        if (!rawResponse) {
          throw new Error('TIMEOUT: No response received from PBX');
        }

        // ── Step 3: Post-Flight Verification ─────────────────────────────────
        const { matched, parsed, actualState } = this._postFlight(rawResponse, expectedState, room);

        if (!matched) {
          throw new Error(
            `STATE_MISMATCH: room=${room} expected=${expectedState} actual=${actualState}`
          );
        }

        // ── ✅ Success ─────────────────────────────────────────────────────────
        this._log('INFO',
          `✅ Command verified successfully: room=${room} action=${action} attempts=${attempts}`
        );

        return {
          success: true,
          data: parsed || { raw: rawResponse },
          room,
          action,
          attempts,
          timestamp: new Date().toISOString(),
        };

      } catch (error) {
        lastError = error.message;
        this._log('WARN',
          `Attempt ${attempts} FAILED for room=${room}: ${error.message}`
        );

        if (attempts >= this.maxRetries) {
          // ── ❌ All Retries Exhausted ────────────────────────────────────────
          this._log('ERROR',
            `❌ All ${this.maxRetries} attempts failed for room=${room} action=${action}. Last error: ${lastError}`
          );
          return {
            success: false,
            data: null,
            room,
            action,
            attempts,
            timestamp: new Date().toISOString(),
            lastError,
          };
        }

        // Exponential Backoff: 1s, 2s, 3s
        const delay = this.retryDelayMs * attempts;
        this._log('INFO', `Retrying in ${delay}ms...`);
        await this._sleep(delay);
      }
    }
  }
}

module.exports = StateVerifier;
