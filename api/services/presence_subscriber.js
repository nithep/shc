'use strict';

/**
 * @file presence_subscriber.js — SHC API MVP Presence Subscriber (B1)
 *
 * สมัครรับสถานะการมีอยู่ (presence) ของแขกในห้องจาก Edge Agent ผ่าน MQTT broker
 * ตัวเดียวกับ `mqtt_connector.js` (MQTT_BROKER_URL) แต่ใช้ **client instance แยกของตัวเอง**
 * เพื่อไม่แตะ frozen file `api/services/mqtt_connector.js`
 *
 * สัญญา event (ตาม Mnemo §9.2 ข้อ 1 + Event Contract v0.1 2026-10-04):
 *   topic   : shc/room/{room_id}/presence   (QoS1 + retain=true)
 *   payload : {
 *     "room_id": "302",
 *     "event": "entered" | "empty" | "count_changed",
 *     "persons": 1,
 *     "confidence": 0.87,
 *     "ts": "2026-10-04T05:50:00+07:00",   // ISO8601 + timezone
 *     "sensor_id": "z2w-302"
 *   }
 *
 * การแปลง event → presence state:
 *   - entered        → present = true
 *   - empty          → present = false
 *   - count_changed  → present = (persons > 0)  (อัปเดต occupancy widget เท่านั้น)
 *
 * หลักการ (ตาม design note §2.3):
 *   - Read-only: subscribe + อัปเดต DB/cache เท่านั้น **ไม่ publish คำสั่งใดๆ**
 *   - **ห้ามสั่ง ECO เอง**: present=false → emit event ให้ policy verifier ตัดสิน
 *   - broker ขาด: reconnect ด้วย backoff + log ลงไฟล์ (ห้าม pop-up console)
 *
 * ความปลอดภัย (ก้อน C ขั้น 0.1):
 *   - **fail-closed**: ถ้าไม่มี `SHC_PRESENCE_MQTT_URL`/`MQTT_BROKER_URL` → ไม่เชื่อมต่อ
 *     (ห้าม fallback ไป broker สาธารณะ) log error ชัดเจน
 *   - **credential แยกเฉพาะ service**: `SHC_PRESENCE_MQTT_USER`/`SHC_PRESENCE_MQTT_PASS`
 *     (1 device/service = 1 credential) — ไม่มี credential → ปิด เว้นแต่ dev opt-in
 *     ด้วย `SHC_PRESENCE_ALLOW_INSECURE=true`
 *
 * @module services/presence_subscriber
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');

const { config } = require('./shc_policy_config');

// ─── Headless file logger (ห้าม pop-up console) ────────────────────────────────

function ensureDir(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (_) { /* ignore */ }
}

function logLine(level, msg) {
    const line = `[presence_subscriber] ${new Date().toISOString()} ${level} ${msg}`;
    try {
        ensureDir(config.logDir);
        const day = new Date().toISOString().slice(0, 10);
        fs.appendFileSync(path.join(config.logDir, `shc-presence-${day}.log`), line + '\n', 'utf8');
    } catch (_) { /* ignore — never crash on logging */ }
    // ใช้ console.error/console.log แบบ headless ได้ (ไม่เปิดหน้าต่างใหม่)
    if (level === 'ERROR') console.error(line);
    else console.log(line);
}

// ─── PresenceSubscriber ────────────────────────────────────────────────────────

class PresenceSubscriber extends EventEmitter {
    /**
     * @param {Object} deps
     * @param {Object} deps.db - database module (api/db.js) สำหรับ persist
     */
    constructor(deps = {}) {
        super();
        this.db = deps.db || null;
        this.branchId = process.env.BRANCH_ID || 'branch_01';

        // ── Fail-closed broker config (ก้อน C ขั้น 0.1) ────────────────────────
        // ห้าม fallback ไป broker สาธารณะเด็ดขาด: ถ้าไม่มี URL → ปิดการเชื่อมต่อ
        // (production ต้องตั้งค่า explicit ใน .env เท่านั้น)
        this.brokerUrl = (process.env.SHC_PRESENCE_MQTT_URL || process.env.MQTT_BROKER_URL || '').trim();

        // ── Credential แยกเฉพาะ service (1 device/service = 1 credential) ─────
        // ใช้ SHC_PRESENCE_MQTT_USER/PASS ของตัวเอง — ห้ามยืม credential รวมของ service อื่น
        this.username = (process.env.SHC_PRESENCE_MQTT_USER || '').trim() || null;
        this.password = process.env.SHC_PRESENCE_MQTT_PASS || null;
        // dev เท่านั้น: ยอมให้เชื่อมแบบไม่ใช้ credential ได้เมื่อไฟล์ .env ระบุชัด
        this.allowInsecure = ['1', 'true', 'yes', 'on'].includes(
            String(process.env.SHC_PRESENCE_ALLOW_INSECURE || '').toLowerCase()
        );

        this.topic = config.presenceTopicPattern;
        this.qos = config.presenceQos;

        this.client = null;
        this.connected = false;
        this.disabled = false;
        this._reconnectDelayMs = 1000;
        this._reconnectMaxMs = 60000;

        /** @type {Map<string, {present:boolean, ts:number, source:string}>} */
        this.cache = new Map();

        // กัน crash: EventEmitter จะ throw ถ้ามี 'error' event แต่ไม่มี listener
        // (T6: MQTT silent/error ต้องไม่ทำให้ process ตาย)
        this.on('error', (err) => {
            logLine('ERROR', `emitted error (handled): ${err && err.message}`);
        });
    }

    /**
     * เชื่อมต่อ broker และ subscribe topic presence (read-only)
     * @returns {Promise<void>}
     */
    connect() {
        if (this.client) return Promise.resolve();

        // ── Fail-closed: ไม่มี broker URL → ห้ามเชื่อมต่อ (ห้าม fallback สาธารณะ) ──
        if (!this.brokerUrl) {
            this.disabled = true;
            logLine('ERROR', 'presence subscriber DISABLED: no SHC_PRESENCE_MQTT_URL / MQTT_BROKER_URL configured (fail-closed, no public broker fallback)');
            this.emit('disabled', { reason: 'no_broker_url' });
            return Promise.resolve();
        }

        // ── เตือนเมื่อไม่มี credential (อนุญาตเฉพาะเมื่อ dev opt-in ชัดเจน) ────────
        if (!this.username && !this.allowInsecure) {
            this.disabled = true;
            logLine('ERROR', 'presence subscriber DISABLED: no SHC_PRESENCE_MQTT_USER configured (set SHC_PRESENCE_ALLOW_INSECURE=true only for local dev)');
            this.emit('disabled', { reason: 'no_credential' });
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const options = {
                clientId: `shc-presence-sub-${this.branchId}-${Math.random().toString(16).slice(2, 10)}`,
                clean: false, // รับ retained message ของ QoS1 + retain
                reconnectPeriod: 0, // ปิด auto-reconnect ของ lib → ใช้ backoff ของเราเอง
            };
            if (this.username) options.username = this.username;
            if (this.password) options.password = this.password;

            this.client = mqtt.connect(this.brokerUrl, options);

            this.client.on('connect', () => {
                this.connected = true;
                this._reconnectDelayMs = 1000;
                logLine('INFO', `connected to broker=${this.brokerUrl} user=${this.username || '(insecure-dev)'}`);
                this.client.subscribe(this.topic, { qos: this.qos }, (err) => {
                    if (err) {
                        logLine('ERROR', `subscribe ${this.topic} failed: ${err.message}`);
                    } else {
                        logLine('INFO', `subscribed topic=${this.topic} qos=${this.qos}`);
                    }
                    this.emit('ready');
                    resolve();
                });
            });

            this.client.on('message', (topic, message) => {
                this._handleMessage(topic, message);
            });

            this.client.on('error', (err) => {
                logLine('ERROR', `mqtt error: ${err && err.message}`);
                this.emit('error', err);
            });

            this.client.on('close', () => {
                this.connected = false;
                this._scheduleReconnect();
            });

            // resolve ทันทีเพื่อไม่ block startup (broker อาจไม่พร้อมใน MVP)
            setTimeout(() => resolve(), 3000);
        });
    }

    /**
     * จัดการ message: parse → validate (ตาม Event Contract) → persist → emit
     * @private
     */
    _handleMessage(topic, message) {
        let payload;
        try {
            payload = JSON.parse(message.toString());
        } catch (e) {
            // malformed payload → log + drop, ห้าม crash
            logLine('ERROR', `malformed payload topic=${topic} raw="${message.toString()}"`);
            this.emit('malformed', { topic, raw: message.toString(), error: e.message });
            return;
        }

        // ดึง room จาก topic หรือ payload (contract ใช้ room_id)
        const topicRoom = this._roomFromTopic(topic);
        const room = String(payload.room_id || payload.room || topicRoom || '').trim();
        const event = String(payload.event || '').trim();

        const VALID_EVENTS = ['entered', 'empty', 'count_changed'];
        if (!room || !VALID_EVENTS.includes(event)) {
            logLine('ERROR', `invalid presence payload topic=${topic} payload=${JSON.stringify(payload)}`);
            this.emit('malformed', { topic, raw: message.toString(), error: 'missing room_id/event or unknown event' });
            return;
        }

        // แปลง event → present
        const persons = Number.isFinite(payload.persons) ? payload.persons : null;
        let present;
        if (event === 'entered') present = true;
        else if (event === 'empty') present = false;
        else present = persons === null ? true : persons > 0; // count_changed

        // ts เป็น ISO8601 (contract) — fallback epoch/now
        const tsMs = this._parseTs(payload.ts);
        const sensorId = payload.sensor_id || 'unknown';
        const confidence = Number.isFinite(payload.confidence) ? payload.confidence : null;

        const state = { present, event, persons, confidence, ts: tsMs, sensorId };

        this.cache.set(room, state);
        this._persist(room, state);

        logLine('INFO', `presence room=${room} event=${event} present=${present} persons=${persons} conf=${confidence} sensor=${sensorId}`);

        // entered/empty → presence event (ขับ policy/idle); count_changed → occupancy เท่านั้น
        this.emit('presence', { room, present, event, persons, confidence, ts: tsMs, sensorId });
        if (event === 'count_changed') {
            this.emit('occupancy', { room, persons, confidence, ts: tsMs, sensorId });
        }
    }

    /**
     * แปลง ts (ISO8601 หรือ epoch) → epoch ms; ถ้าไม่ถูกต้องใช้เวลาปัจจุบัน
     * @private
     */
    _parseTs(ts) {
        if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
        if (typeof ts === 'string' && ts) {
            const parsed = Date.parse(ts);
            if (Number.isFinite(parsed)) return parsed;
        }
        return Date.now();
    }

    /**
     * เขียนลงตาราง rooms (คอลัมน์ใหม่ additive) — best-effort
     * @private
     */
    _persist(room, state) {
        if (!this.db || !this.db.db) return;
        const iso = new Date(state.ts).toISOString();
        try {
            this.db.db.run(
                'UPDATE rooms SET last_presence_at = ? WHERE id = ?',
                [iso, room],
                (err) => {
                    if (err) logLine('ERROR', `persist presence room=${room} failed: ${err.message}`);
                }
            );
        } catch (e) {
            logLine('ERROR', `persist presence exception room=${room}: ${e.message}`);
        }
    }

    /**
     * แปลง topic → room id
     * @private
     */
    _roomFromTopic(topic) {
        const m = String(topic).match(/^shc\/room\/([^/]+)\/presence$/);
        return m ? m[1] : null;
    }

    /**
     * Reconnect ด้วย exponential backoff (1s → 2s → ... → max 60s)
     * @private
     */
    _scheduleReconnect() {
        if (!this.client) return;
        const delay = this._reconnectDelayMs;
        this._reconnectDelayMs = Math.min(this._reconnectDelayMs * 2, this._reconnectMaxMs);
        logLine('INFO', `reconnect scheduled in ${delay}ms`);
        setTimeout(() => {
            if (this.connected || !this.client) return;
            try {
                this.client.reconnect();
            } catch (e) {
                logLine('ERROR', `reconnect failed: ${e.message}`);
                this._scheduleReconnect();
            }
        }, delay);
    }

    /**
     * อ่านสถานะ presence ปัจจุบันของห้อง (จาก cache)
     * @param {string|number} room
     * @returns {{present:boolean, event:string, persons:number|null, confidence:number|null, ts:number, sensorId:string}|null}
     */
    getPresence(room) {
        return this.cache.get(String(room)) || null;
    }

    /**
     * ปิดการเชื่อมต่อ
     */
    async close() {
        if (!this.client) return;
        this.client.removeAllListeners();
        return new Promise((resolve) => {
            this.client.end(true, () => {
                this.client = null;
                this.connected = false;
                resolve();
            });
        });
    }
}

module.exports = { PresenceSubscriber };
