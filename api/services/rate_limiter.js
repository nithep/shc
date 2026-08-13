'use strict';

/**
 * Rate Limiter — Sliding Window Counter
 * จำกัดจำนวนคำสั่งต่อนาทีต่อห้อง เพื่อป้องกัน runaway loop
 * ตาม Implementation Plan Section 6: ≤ 3 cmd/min/room
 */

const DEFAULT_MAX_COMMANDS = 3;
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 นาที

class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.maxCommands - จำนวนคำสั่งสูงสุดต่อ window (default: 3)
   * @param {number} options.windowMs - ขนาดหน้าต่างเวลาเป็น ms (default: 60000)
   */
  constructor(options = {}) {
    this.maxCommands = options.maxCommands || DEFAULT_MAX_COMMANDS;
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    // Map<roomKey, timestamp[]>
    this._buckets = new Map();
  }

  /**
   * ตรวจสอบว่าห้องนี้ยังส่งคำสั่งได้อีกหรือไม่
   * @param {string|number} roomId
   * @param {Date} [now]
   * @returns {{ allowed: boolean, remaining: number, resetAt: string, count: number }}
   */
  check(roomId, now = new Date()) {
    const key = String(roomId);
    this._prune(key, now);

    const timestamps = this._buckets.get(key) || [];
    const count = timestamps.length;
    const allowed = count < this.maxCommands;
    const remaining = Math.max(0, this.maxCommands - count);

    // resetAt = เวลาที่ timestamp เก่าสุดจะหมดอายุ
    const resetAt = timestamps.length > 0
      ? new Date(timestamps[0] + this.windowMs).toISOString()
      : new Date(now.getTime() + this.windowMs).toISOString();

    return { allowed, remaining, resetAt, count };
  }

  /**
   * บันทึกว่าห้องนี้ถูกส่งคำสั่งแล้ว 1 ครั้ง
   * @param {string|number} roomId
   * @param {Date} [now]
   * @returns {{ allowed: boolean, remaining: number, resetAt: string, count: number }}
   */
  record(roomId, now = new Date()) {
    const key = String(roomId);
    this._prune(key, now);

    if (!this._buckets.has(key)) {
      this._buckets.set(key, []);
    }

    const timestamps = this._buckets.get(key);
    const count = timestamps.length;

    if (count >= this.maxCommands) {
      const resetAt = new Date(timestamps[0] + this.windowMs).toISOString();
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        count,
      };
    }

    timestamps.push(now.getTime());
    const newCount = timestamps.length;
    const remaining = Math.max(0, this.maxCommands - newCount);
    const resetAt = new Date(timestamps[0] + this.windowMs).toISOString();

    return {
      allowed: true,
      remaining,
      resetAt,
      count: newCount,
    };
  }

  /**
   * ตรวจสอบหลายห้องพร้อมกัน (สำหรับ batch commands)
   * @param {Array<string|number>} roomIds
   * @param {Date} [now]
   * @returns {{ allAllowed: boolean, blocked: Array<{ roomId: string, result: object }> }}
   */
  checkBatch(roomIds, now = new Date()) {
    const blocked = [];
    for (const roomId of roomIds) {
      const result = this.check(roomId, now);
      if (!result.allowed) {
        blocked.push({ roomId: String(roomId), ...result });
      }
    }
    return {
      allAllowed: blocked.length === 0,
      blocked,
    };
  }

  /**
   * ลบ timestamps ที่หมดอายุแล้ว
   * @private
   */
  _prune(key, now) {
    const timestamps = this._buckets.get(key);
    if (!timestamps || timestamps.length === 0) {
      return;
    }

    const cutoff = now.getTime() - this.windowMs;
    let i = 0;
    while (i < timestamps.length && timestamps[i] <= cutoff) {
      i++;
    }

    if (i > 0) {
      timestamps.splice(0, i);
    }

    if (timestamps.length === 0) {
      this._buckets.delete(key);
    }
  }

  /**
   * รีเซ็ตข้อมูลทั้งหมด (สำหรับ testing)
   */
  reset() {
    this._buckets.clear();
  }
}

module.exports = { RateLimiter };
