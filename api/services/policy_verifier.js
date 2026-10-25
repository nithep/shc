'use strict';

/**
 * @file policy_verifier.js — SHC API MVP Policy Verifier (B4)
 *
 * ชั้นนโยบาย (Policy Layer) ที่ห่อ (wrap) เหนือ Hardware StateVerifier (frozen)
 * ทำหน้าที่ตัดสินตามนโยบายธุรกิจ 5 ข้อ (สเปก SHC API MVP §5)
 *
 * ┌──────────────────────────┐
 * │  Policy Verifier (ไฟล์นี้) │  ← ตรวจนโยบาย 5 ข้อ → allow / deny / defer
 * └──────────────────────────┘
 *              │ (ผ่านนโยบายเท่านั้น)
 *              ▼
 * ┌──────────────────────────┐
 * │ Hardware StateVerifier    │  ← ของเดิม (frozen) — ตรวจ ACK/state จริง
 * └──────────────────────────┘
 *
 * ── ความหมายคำสั่ง (สเปก §5 — ยืนยัน Gate 2) ────────────────────────────────
 *   eco_on  = เข้าโหมด ECO (ตัดไฟ)         ← ด่านกลางคืนกันคำสั่งนี้
 *   eco_off = ออกจากโหมด ECO (คืนไฟปกติ)
 *
 * Checklist 5 ข้อ (ลำดับตามสเปก §5):
 *   1) override locked → deny
 *   2) state transition legal? (VACANT→ECO illegal) → deny
 *   3) relay already at target state → skip (idempotency)
 *   4) safety: กลางคืนห้าม eco_on / ประตูเปิดค้าง > X นาที (door-open-too-long) → deny + alert
 *   5) relay same room command < 2 min apart → deny
 *
 * ── นาฬิกา idle (§4) ─────────────────────────────────────────────────────────
 *   idle = now − last_door_open_at   (door = พยานหลัก)
 *   presence อย่างเดียวห้ามขับ ECO ใน MVP (ใช้เป็นข้อมูลประกอบ/occupancy เท่านั้น)
 *
 * กฎเหล็ก: ทุก path ที่จะไปถึง relay ต้องผ่าน verify() — log ทุก denial
 *           (room/command/rule/time/reason) — **ห้ามแตะ hardware verifier ตัวเดิม**
 *
 * @module services/policy_verifier
 */

const fs = require('fs');
const path = require('path');
const { config, idleThresholdForRoom } = require('./shc_policy_config');
const { executeAndVerify } = require('./hardware_verification');

// ─── Result types ──────────────────────────────────────────────────────────────

const DECISION = Object.freeze({
    ALLOW: 'allow',
    DENY: 'deny',
    SKIP: 'skip',   // idempotency — ไม่ต้องยิงคำสั่ง
    DEFER: 'defer', // ส่งเข้า approval gate เดิม
});

const COMMAND = Object.freeze({
    ECO_ON: 'eco_on',   // เข้าโหมด ECO = ตัดไฟ (สเปก §5)
    ECO_OFF: 'eco_off', // ออกจากโหมด ECO = คืนไฟปกติ
    DIM: 'dim',         // หรี่ไฟ
});

const RULE = Object.freeze({
    R1_OVERRIDE_LOCKED: 'rule1_override_locked',
    R2_ILLEGAL_TRANSITION: 'rule2_illegal_transition',
    R3_IDEMPOTENT: 'rule3_idempotent_skip',
    R4_NIGHT_GUARD: 'rule4_night_no_eco_on',
    R4_DOOR_OPEN_TOO_LONG: 'rule4_door_open_too_long',
    R5_RELAY_FLAP: 'rule5_relay_flap',
    OK: 'ok',
});

// ─── Headless logger ───────────────────────────────────────────────────────────

function ensureDir(dir) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}

// ─── PolicyVerifier ────────────────────────────────────────────────────────────

class PolicyVerifier {
    /**
     * @param {Object} deps
     * @param {Object} deps.db - api/db.js (มี .db)
     * @param {Object} [deps.pbx] - pbx facade (hardware) — ผ่านได้เพื่อ execute เมื่อ ALLOW
     * @param {Object} [deps.hardwareVerifier] - hardware StateVerifier (frozen) — inject สำหรับ test
     * @param {Object} [deps.auditLog] - audit sink { appendAuditEvent }
     * @param {Object} [deps.notifier] - notifier (stub ใน MVP) { sendSystemAlert }
     * @param {Function} [deps.now] - injectable clock (test)
     */
    constructor(deps = {}) {
        this.db = deps.db || null;
        this.pbx = deps.pbx || null;
        this.hardwareVerifier = deps.hardwareVerifier || null;
        this.auditLog = deps.auditLog || null;
        this.notifier = deps.notifier || null;
        this.now = deps.now || (() => Date.now());

        /** in-memory last relay command time: Map<roomId, epoch_ms> */
        this._lastRelayAt = new Map();
        /** recent decisions (audit trail ในหน่วยความจำ) */
        this.decisions = [];
    }

    /**
     * โหลดสถานะห้องจาก DB เพื่อใช้ตัดสิน
     * @param {string|number} room
     * @returns {Promise<Object|null>}
     * @private
     */
    _loadRoom(room) {
        return new Promise((resolve) => {
            if (!this.db || !this.db.db) return resolve(null);
            this.db.db.get(
                'SELECT id, status, power, last_door_open_at, last_presence_at, door_closed, override_locked, warned FROM rooms WHERE id = ?',
                [String(room)],
                (err, row) => resolve(err ? null : (row || null))
            );
        });
    }

    /**
     * บันทึก denial + decision ลง audit (immutable) และ log ไฟล์
     * @private
     */
    _record(entry) {
        this.decisions.push(entry);
        if (this.decisions.length > 500) this.decisions.shift();

        if (entry.decision !== DECISION.ALLOW) {
            const line = `[policy_verifier] ${new Date(entry.time).toISOString()} ${entry.decision.toUpperCase()} room=${entry.room} command=${entry.command} rule=${entry.rule} reason="${entry.reason}"`;
            try {
                ensureDir(config.logDir);
                const day = new Date().toISOString().slice(0, 10);
                fs.appendFileSync(path.join(config.logDir, `shc-policy-${day}.log`), line + '\n', 'utf8');
            } catch (_) { /* ignore */ }
            console.log(line);
        }

        if (this.auditLog && typeof this.auditLog.appendAuditEvent === 'function') {
            try {
                this.auditLog.appendAuditEvent({
                    eventType: 'AUTO_PASSED',
                    command: {
                        commandType: entry.command,
                        riskCode: entry.rule,
                        targetRooms: [String(entry.room)],
                        requestedBy: 'system:policy_verifier',
                        source: 'policy_verifier',
                        dryRun: config.dryRun,
                        executionMode: entry.decision,
                        metadata: { reason: entry.reason },
                    },
                    decision: entry.decision,
                    result: entry.rule,
                });
            } catch (e) {
                console.log(`[policy_verifier] audit append failed: ${e.message}`);
            }
        }
    }

    /**
     * ตรวจสอบนโยบาย 5 ข้อ (pure decision — ไม่มี side effect ต่อ hardware)
     *
     * @param {Object} req
     * @param {string|number} req.room
     * @param {string} req.command - COMMAND.*
     * @param {Object} [req.context] - { status, power, overrideLocked, doorClosed, lastDoorOpenAt, lastPresenceAt, now }
     * @returns {Promise<{decision:string, rule:string, reason:string}>}
     */
    async verify(req) {
        const now = req.context?.now ?? this.now();
        const room = String(req.room);
        const command = req.command;

        const ctx = req.context || await this._loadRoom(room) || {};
        const status = String(ctx.status || '').toLowerCase();
        const power = ctx.power === true || ctx.power === 1;
        const overrideLocked = ctx.override_locked === 1 || ctx.override_locked === true || ctx.overrideLocked === true;
        const doorClosed = ctx.door_closed === 1 || ctx.door_closed === true || ctx.doorClosed === true;
        const lastDoorOpenAt = ctx.last_door_open_at || ctx.lastDoorOpenAt || null;
        const lastRelayAt = this._lastRelayAt.get(room) || null;

        const deny = (rule, reason) => {
            const entry = { room, command, decision: DECISION.DENY, rule, reason, time: now };
            this._record(entry);
            return { decision: DECISION.DENY, rule, reason };
        };
        const skip = (reason) => {
            const entry = { room, command, decision: DECISION.SKIP, rule: RULE.R3_IDEMPOTENT, reason, time: now };
            this._record(entry);
            return { decision: DECISION.SKIP, rule: RULE.R3_IDEMPOTENT, reason };
        };
        const allow = () => {
            const entry = { room, command, decision: DECISION.ALLOW, rule: RULE.OK, reason: 'policy passed', time: now };
            this._record(entry);
            return { decision: DECISION.ALLOW, rule: RULE.OK, reason: 'policy passed' };
        };

        // ── ข้อ 1: override locked → deny (ทุกคำสั่ง) ─────────────────────────
        if (overrideLocked) {
            return deny(RULE.R1_OVERRIDE_LOCKED, 'room override is locked');
        }

        if (command === COMMAND.ECO_ON) {
            // eco_on = เข้าโหมด ECO (ตัดไฟ)

            // ── ข้อ 2: state transition legal (VACANT→ECO illegal) ─────────────
            if (status === 'vacant') {
                return deny(RULE.R2_ILLEGAL_TRANSITION, 'illegal transition VACANT→ECO (room vacant)');
            }

            // ── ข้อ 3: relay already OFF (ECO state) → skip (idempotent) ───────
            if (power === false) {
                return skip('relay already OFF (eco state)');
            }

            // ── ข้อ 4a: กลางคืนห้าม eco_on (ตัดไฟ) — §5 ข้อ 4 ─────────────────
            if (this._isSleepGuardActive(now)) {
                return deny(RULE.R4_NIGHT_GUARD, `sleep guard active (${config.sleepGuardStartHour}:00–${config.sleepGuardEndHour}:00) — no eco_on`);
            }

            // ── ข้อ 4b: ประตูเปิดค้าง > X นาที (door-open-too-long) → deny + alert
            //    ⚠️ ไม่ใช่ "sensor silent/heartbeat" — heartbeat จริงเป็นงานเฟิร์มแวร์โหนด (ก้อน C)
            if (this._isDoorOpenTooLong(lastDoorOpenAt, doorClosed, now)) {
                const openMin = ((now - new Date(lastDoorOpenAt).getTime()) / 60000).toFixed(1);
                const msg = `door open ${openMin} min > X=${config.doorSensorTimeoutMin} min (door-open-too-long)`;
                this._alert(room, msg);
                return deny(RULE.R4_DOOR_OPEN_TOO_LONG, msg);
            }

            // ── ข้อ 5: relay same room command < 2 min apart → deny ────────────
            if (lastRelayAt && (now - lastRelayAt) < config.relayMinIntervalMin * 60000) {
                const gapSec = ((now - lastRelayAt) / 1000).toFixed(0);
                return deny(RULE.R5_RELAY_FLAP, `relay command ${gapSec}s apart < ${config.relayMinIntervalMin} min`);
            }

            return allow();
        }

        if (command === COMMAND.ECO_OFF) {
            // eco_off = ออกจากโหมด ECO (คืนไฟปกติ)

            // ── ข้อ 3: relay already ON → skip (idempotent) ────────────────────
            if (power === true) {
                return skip('relay already ON (not in eco state)');
            }

            // ── ข้อ 5: relay same room command < 2 min apart → deny ────────────
            if (lastRelayAt && (now - lastRelayAt) < config.relayMinIntervalMin * 60000) {
                const gapSec = ((now - lastRelayAt) / 1000).toFixed(0);
                return deny(RULE.R5_RELAY_FLAP, `relay command ${gapSec}s apart < ${config.relayMinIntervalMin} min`);
            }

            // เปิดไฟกลางคืนทำได้ (ด่านกลางคืนคุมเฉพาะ eco_on)
            return allow();
        }

        // คำสั่งอื่น (dim ฯลฯ) — ใน MVP ให้ผ่าน policy พื้นฐาน (override handled)
        return allow();
    }

    /**
     * ตัดสิน + (ถ้า ALLOW และไม่ dry-run) execute ผ่าน hardware verifier/pbx
     *
     * @param {Object} req - เดียวกับ verify()
     * @returns {Promise<Object>} { decision, rule, reason, executed, dryRun, hardwareResult? }
     */
    async verifyAndExecute(req) {
        const result = await this.verify(req);

        if (result.decision !== DECISION.ALLOW) {
            return { ...result, executed: false, dryRun: config.dryRun };
        }

        // MVP: dry-run บังคับ → ไม่ยิง hardware จริง
        if (config.dryRun) {
            console.log(`[policy_verifier] DRY-RUN would execute room=${req.room} command=${req.command}`);
            return { ...result, executed: false, dryRun: true };
        }

        // ผ่านนโยบาย + ไม่ dry-run → เข้า hardware verifier (frozen) ผ่าน pbx facade
        if (!this.pbx) {
            return { ...result, executed: false, dryRun: false, hardwareResult: null, note: 'no pbx wired' };
        }

        const isEcoOn = req.command === COMMAND.ECO_ON;

        const outcome = await executeAndVerify({
            hardwareVerifier: this.hardwareVerifier,
            pbx: this.pbx,
            room: req.room,
            commandType: req.command,
            action: isEcoOn ? 'ROOM_OFF' : 'ROOM_ON',
            executeFn: async () => (isEcoOn
                ? this.pbx.checkOut(req.room)
                : this.pbx.checkIn(req.room)),
        });

        if (!outcome.success) {
            console.log(`[policy_verifier] hardware verification failed room=${req.room}: ${outcome.reason}`);
            return {
                ...result,
                decision: DECISION.DENY,
                executed: false,
                dryRun: false,
                hardwareResult: outcome.verification,
                reason: `hardware verification failed: ${outcome.reason}`,
            };
        }

        this._lastRelayAt.set(String(req.room), this.now());
        return { ...result, executed: true, dryRun: false, hardwareResult: outcome.verification };
    }

    /**
     * ตรวจว่าอยู่ในช่วง sleep guard (22:00–06:00) หรือไม่
     * @param {number} nowMs
     * @returns {boolean}
     * @private
     */
    _isSleepGuardActive(nowMs) {
        const h = new Date(nowMs).getHours();
        const start = config.sleepGuardStartHour;
        const end = config.sleepGuardEndHour;
        if (start === end) return false;
        if (start < end) return h >= start && h < end;
        // wrap เที่ยงคืน เช่น 22 → 6
        return h >= start || h < end;
    }

    /**
     * ประตูเปิดค้างนานเกิน X นาที หรือไม่ (door-open-too-long)
     * เงื่อนไข: มี last_door_open_at, ประตูยังไม่ปิด, และเปิดค้าง > X นาที
     * @private
     */
    _isDoorOpenTooLong(lastDoorOpenAt, doorClosed, nowMs) {
        if (!lastDoorOpenAt || doorClosed) return false;
        const openMin = (nowMs - new Date(lastDoorOpenAt).getTime()) / 60000;
        return Number.isFinite(openMin) && openMin > config.doorSensorTimeoutMin;
    }

    /**
     * ส่ง alert ผ่าน notifier (stub ใน MVP) — log อย่างเดียว
     * @private
     */
    _alert(room, msg) {
        const line = `[policy_verifier] ALERT room=${room} ${msg}`;
        console.log(line);
        if (this.notifier && typeof this.notifier.sendSystemAlert === 'function') {
            try {
                this.notifier.sendSystemAlert('Policy Safety Alert', `ห้อง ${room}: ${msg}`, true);
            } catch (_) { /* ignore */ }
        }
    }

    /**
     * ตรวจ idle จาก door timestamp (สเปก §4: idle = now − last_door_open_at)
     *
     * @param {Object} room - แถวจาก DB (มี id, last_door_open_at, door_closed, warned)
     * @param {number} nowMs
     * @returns {{idleMin:number, thresholdMin:number, shouldWarn:boolean, shouldEcoOn:boolean, doorOpenTooLong:boolean, hasDoorWitness:boolean}}
     */
    evaluateIdle(room, nowMs) {
        const thresholdMin = idleThresholdForRoom(room.id);
        const doorClosed = room.door_closed === 1 || room.door_closed === true;
        const lastDoorMs = room.last_door_open_at ? new Date(room.last_door_open_at).getTime() : null;
        const hasDoorWitness = Number.isFinite(lastDoorMs);
        const idleMin = hasDoorWitness ? (nowMs - lastDoorMs) / 60000 : 0;
        const shouldWarn = hasDoorWitness && idleMin >= (thresholdMin - config.warnLeadMin) && idleMin < thresholdMin;
        const shouldEcoOn = hasDoorWitness && idleMin >= thresholdMin;
        const doorOpenTooLong = this._isDoorOpenTooLong(room.last_door_open_at, doorClosed, nowMs);
        return { idleMin, thresholdMin, shouldWarn, shouldEcoOn, doorOpenTooLong, hasDoorWitness };
    }
}

module.exports = { PolicyVerifier, DECISION, COMMAND, RULE };
