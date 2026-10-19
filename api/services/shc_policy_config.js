'use strict';

/**
 * @file shc_policy_config.js — SHC API MVP Policy Configuration
 *
 * ศูนย์รวมค่าคอนฟิกของชั้น Policy (presence / door / idle / 60s checker)
 * เพื่อห้าม hardcode ค่า threshold ในไฟล์ logic ใดๆ (ตามหลักการตั้งต้น §1 ข้อ 2)
 *
 * ทุกค่ามาจาก environment variable โดยมี default ที่ปลอดภัย (fail-safe = ON)
 * และค่า dry-run บังคับเปิดตลอด MVP (Mnemo Decision Log §9.2 ข้อ 4/6)
 *
 * @module services/shc_policy_config
 */

function envInt(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

/**
 * ค่า timeout ของ door sensor (นาที) — "ค่า X" ที่สเปกยังไม่นิยาม
 *
 * ข้อเสนอ (B6): X = 10 นาที
 * เหตุผล:
 *  1. ค่า idle ปกติของห้องคือ 20 นาที → X ควรน้อยกว่าครึ่งหนึ่งของ idle
 *     เพื่อให้ door-sensor-silent ถูกจับได้ "ก่อน" ที่ idle threshold จะทำงาน
 *     (X = 10 = 50% ของ idle ปกติ 20 นาที)
 *  2. ห้องแบบ suite idle 30 นาที → X 10 นาที = 1/3 ของ idle → ยังมีความหมาย
 *     เป็น safety guard ก่อนถึงรอบตัดไฟ
 *  3. 10 นาทีเป็นค่าที่อ่านง่ายสำหรับพนักงาน และไม่สั้นจนเกิด false positive
 *     จากการที่แขกหลับ/นั่งเงียบในห้องโดยไม่ขยับ (ซึ่งไม่ควรนับเป็น door silent)
 *  4. ค่านี้เป็น safety guard ระดับ deny+alert เท่านั้น (ไม่ตัดไฟเอง)
 *     จึงเลือกให้ conservative (ไม่สั้นเกินไป) เพื่อลด noise
 *  หมายเหตุ: ต้องยืนยันที่ gate 2 (Mnemo) ตามที่ตกลง
 */
const DEFAULT_DOOR_SENSOR_TIMEOUT_MIN = 10;

const config = {
    // ─── Idle thresholds (นาที) ─────────────────────────────────────────────
    idleThresholdMinNormal: envInt('SHC_IDLE_THRESHOLD_MIN_NORMAL', 20),
    idleThresholdMinSuite: envInt('SHC_IDLE_THRESHOLD_MIN_SUITE', 30),

    // ─── Dim/warn lead time (นาที) — เตือนเมื่อ idle >= threshold - lead ────
    warnLeadMin: envInt('SHC_WARN_LEAD_MIN', 1),

    // ─── Door sensor timeout = ค่า X (นาที, ดู rationale ด้านบน) ─────────────
    doorSensorTimeoutMin: envInt('SHC_DOOR_SENSOR_TIMEOUT_MIN', DEFAULT_DOOR_SENSOR_TIMEOUT_MIN),

    // ─── Anti-flap: คำสั่ง relay ห้องเดิมห่างกันน้อยกว่านี้ (นาที) → deny ───
    relayMinIntervalMin: envInt('SHC_RELAY_MIN_INTERVAL_MIN', 2),

    // ─── Sleep guard (ชั่วโมงเต็ม, 22:00–06:00) ─────────────────────────────
    sleepGuardStartHour: envInt('SHC_SLEEP_GUARD_START_HOUR', 22),
    sleepGuardEndHour: envInt('SHC_SLEEP_GUARD_END_HOUR', 6),

    // ─── 60s checker ────────────────────────────────────────────────────────
    // ตัวตรวจตื่นทุก 60 วิ แล้วคำนวณ elapsed จาก timestamp ที่เก็บ (timestamp-based)
    checkIntervalSec: envInt('SHC_CHECK_INTERVAL_SEC', 60),
    checkerCron: process.env.SHC_CHECKER_CRON || '* * * * *', // ทุกนาที (60 วิ)

    // ─── Dry-run (บังคับ ON ตลอด MVP — gate auto-eviction/notifier จริง) ────
    dryRun: envBool('SHC_POLICY_DRY_RUN', true),

    // ─── Room classification (suite = idle threshold สูงกว่า) ───────────────
    // รายชื่อ room id ที่เป็น suite คั่นด้วย comma; ว่าง = ไม่มี suite
    suiteRoomIds: (process.env.SHC_SUITE_ROOM_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),

    // ─── MQTT presence (namespace ใหม่ตาม Mnemo §9.2 ข้อ 1) ─────────────────
    presenceTopicPattern: process.env.SHC_PRESENCE_TOPIC || 'shc/room/+/presence',
    presenceQos: envInt('SHC_PRESENCE_QOS', 1),

    // ─── Log directory (ห้าม pop-up console) ────────────────────────────────
    logDir: process.env.SHC_LOG_DIR || 'D:\\_scripts\\logs',
};

/**
 * หา idle threshold (นาที) ของห้องหนึ่งๆ ตามชนิดห้อง
 * @param {string|number} roomId
 * @returns {number} นาที
 */
function idleThresholdForRoom(roomId) {
    const id = String(roomId);
    const isSuite = config.suiteRoomIds.some(s => s === id || s === id.replace(/^0+/, ''));
    return isSuite ? config.idleThresholdMinSuite : config.idleThresholdMinNormal;
}

module.exports = {
    config,
    idleThresholdForRoom,
    DEFAULT_DOOR_SENSOR_TIMEOUT_MIN,
};
