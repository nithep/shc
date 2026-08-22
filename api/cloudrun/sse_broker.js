'use strict';

/**
 * @file sse_broker.js — Server-Sent Events (SSE) Broker
 *
 * จัดการ client connection (ServerResponse) ที่สมัครรับเหตุการณ์เรียลไทม์
 * แยกตามหมายเลขห้องพัก (roomNo). เมื่อ Cloud ได้รับผลยืนยันจาก Edge ผ่าน MQTT
 * จะเรียก `publish(roomNo, event, data)` เพื่อ push กลับไปยัง LINE LIFF
 * ให้เล่นแอนิเมชัน "ไฟสว่างวาบ" ทันที.
 *
 * @module cloudrun/sse_broker
 * @author Hotel ECS Integration Team
 */

class SseBroker {
  constructor() {
    /** @type {Map<string, Set<import('http').ServerResponse>>} roomNo -> clients */
    this.clients = new Map();
  }

  /**
   * เพิ่ม client ลงในรายชื่อผู้รับเหตุการณ์ของห้อง.
   * @param {string|number} roomNo - หมายเลขห้อง
   * @param {import('http').ServerResponse} res - Express response (SSE stream)
   * @returns {Function} cleanup function สำหรับลบ client เมื่อ connection ปิด
   */
  addClient(roomNo, res) {
    const key = String(roomNo);
    if (!this.clients.has(key)) this.clients.set(key, new Set());
    this.clients.get(key).add(res);

    console.log(`[SSE] ➕ Client attached to room ${key} (total: ${this.clients.get(key).size})`);
    return () => this.removeClient(key, res);
  }

  /**
   * ลบ client ออกจากรายชื่อ.
   * @private
   */
  removeClient(roomNo, res) {
    const set = this.clients.get(roomNo);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) {
      this.clients.delete(roomNo);
      console.log(`[SSE] ➖ No more clients for room ${roomNo}`);
    }
  }

  /**
   * ส่ง event ให้ทุก client ของห้องนั้น ๆ.
   * @param {string|number} roomNo - หมายเลขห้อง
   * @param {string} event - ชื่อ event (เช่น 'state', 'session')
   * @param {Object} data - ข้อมูล JSON ที่จะส่ง
   */
  publish(roomNo, event, data) {
    const set = this.clients.get(String(roomNo));
    if (!set || set.size === 0) return;

    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
      try {
        res.write(frame);
      } catch (_) {
        // Connection อาจปิดไปแล้ว — จะถูก clean เมื่อ 'close' event มาถึง
      }
    }
  }

  /**
   * จำนวน client ที่เชื่อมต่อทั้งหมด.
   * @returns {number}
   */
  totalClients() {
    let count = 0;
    for (const set of this.clients.values()) count += set.size;
    return count;
  }
}

module.exports = { SseBroker };
