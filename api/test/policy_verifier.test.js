'use strict';

/**
 * @file policy_verifier.test.js — SHC API MVP Acceptance Tests (B4, สเปก §5/§8)
 *
 * Dependency-free runner (node:assert) — ไม่พึ่ง jest (ไม่มีใน api/)
 * รัน: node api/test/policy_verifier.test.js
 *
 * ความหมายคำสั่ง (สเปก §5): eco_on = เข้าโหมด ECO (ตัดไฟ), eco_off = คืนไฟ
 *
 * เคส checklist §5:
 *   rule1 override locked → deny
 *   rule2 VACANT→ECO illegal → deny
 *   rule3 relay already at target → skip
 *   rule4 กลางคืนห้าม eco_on → deny
 *   rule4 ประตูเปิดค้าง > X → deny + alert
 *   rule5 relay < 2 นาที → deny
 * เคส idle (§4): นับจาก last_door_open_at
 */

const assert = require('assert');
const { PolicyVerifier, DECISION, RULE } = require('../services/policy_verifier');
const { config } = require('../services/shc_policy_config');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try { fn(); passed++; console.log(`  ✅ ${name}`); }
    catch (e) { failed++; console.error(`  ❌ ${name}\n     ${e.message}`); }
}

async function testAsync(name, fn) {
    try { await fn(); passed++; console.log(`  ✅ ${name}`); }
    catch (e) { failed++; console.error(`  ❌ ${name}\n     ${e.message}`); }
}

function fixedNow(hour, minute = 0) {
    const d = new Date('2026-10-20T00:00:00+07:00');
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
}

function mkVerifier(nowMs) { return new PolicyVerifier({ now: () => nowMs }); }

(async () => {
    console.log('\n=== B4 policy_verifier — Checklist §5 (eco_on = ตัดไฟ) ===');
    const noon = fixedNow(14);

    await testAsync('rule1: override locked → deny', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '101', command: 'eco_on', context: { status: 'occupied', power: true, override_locked: 1, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R1_OVERRIDE_LOCKED);
    });

    await testAsync('rule2: VACANT→ECO illegal → deny', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '102', command: 'eco_on', context: { status: 'vacant', power: false, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R2_ILLEGAL_TRANSITION);
    });

    await testAsync('rule3: relay already OFF (eco) → skip (idempotent)', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '103', command: 'eco_on', context: { status: 'occupied', power: false, now: noon } });
        assert.strictEqual(r.decision, DECISION.SKIP);
        assert.strictEqual(r.rule, RULE.R3_IDEMPOTENT);
    });

    await testAsync('rule4: กลางคืนห้าม eco_on → deny (night guard)', async () => {
        const night = fixedNow(23);
        const pv = mkVerifier(night);
        const r = await pv.verify({ room: '105', command: 'eco_on', context: { status: 'occupied', power: true, now: night } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R4_NIGHT_GUARD);
    });

    await testAsync('rule4: ประตูเปิดค้าง > X → deny + alert (door-open-too-long)', async () => {
        const pv = mkVerifier(noon);
        const lastDoor = new Date(noon - (config.doorSensorTimeoutMin + 5) * 60000).toISOString();
        const r = await pv.verify({ room: '104', command: 'eco_on', context: { status: 'occupied', power: true, last_door_open_at: lastDoor, door_closed: 0, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R4_DOOR_OPEN_TOO_LONG);
    });

    await testAsync('rule5: relay same room < 2 min apart → deny', async () => {
        const pv = mkVerifier(noon);
        pv._lastRelayAt.set('106', noon - 60000);
        const r = await pv.verify({ room: '106', command: 'eco_on', context: { status: 'occupied', power: true, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R5_RELAY_FLAP);
    });

    await testAsync('pass: occupied + power on + กลางวัน + ประตูปิด → allow eco_on', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '107', command: 'eco_on', context: { status: 'occupied', power: true, door_closed: 1, now: noon } });
        assert.strictEqual(r.decision, DECISION.ALLOW);
    });

    await testAsync('eco_off (คืนไฟ) กลางคืน → allow (ด่านกลางคืนคุมเฉพาะ eco_on)', async () => {
        const night = fixedNow(23);
        const pv = mkVerifier(night);
        const r = await pv.verify({ room: '108', command: 'eco_off', context: { status: 'occupied', power: false, now: night } });
        assert.strictEqual(r.decision, DECISION.ALLOW);
    });

    await testAsync('eco_off: relay already ON → skip (idempotent)', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '109', command: 'eco_off', context: { status: 'occupied', power: true, now: noon } });
        assert.strictEqual(r.decision, DECISION.SKIP);
    });

    console.log('\n=== B4 idle logic §4 — นับจาก last_door_open_at ===');

    test('T1: door idle 30 min → shouldEcoOn = true (threshold 20)', () => {
        const pv = mkVerifier(noon);
        const res = pv.evaluateIdle({ id: 201, last_door_open_at: new Date(noon - 30 * 60000).toISOString(), door_closed: 1 }, noon);
        assert.strictEqual(res.shouldEcoOn, true, `idle=${res.idleMin}`);
    });

    test('T2: door idle 29 min (suite threshold 30) → no eco, warn zone', () => {
        const pv = mkVerifier(noon);
        config.suiteRoomIds = ['9001'];
        const res = pv.evaluateIdle({ id: 9001, last_door_open_at: new Date(noon - 29 * 60000).toISOString(), door_closed: 1 }, noon);
        assert.strictEqual(res.thresholdMin, 30);
        assert.strictEqual(res.shouldEcoOn, false, `idle=${res.idleMin}`);
        assert.strictEqual(res.shouldWarn, true);
        config.suiteRoomIds = [];
    });

    test('T5: presence อย่างเดียว (ไม่มี door witness) → shouldEcoOn = false', () => {
        const pv = mkVerifier(noon);
        const res = pv.evaluateIdle({ id: 205, last_door_open_at: null, last_presence_at: new Date(noon - 60 * 60000).toISOString() }, noon);
        assert.strictEqual(res.shouldEcoOn, false, 'presence ไม่มีสิทธิ์ขับ ECO');
        assert.strictEqual(res.hasDoorWitness, false);
    });

    test('T-door-too-long: ประตูเปิดค้าง > X → doorOpenTooLong = true', () => {
        const pv = mkVerifier(noon);
        const res = pv.evaluateIdle({ id: 206, last_door_open_at: new Date(noon - 30 * 60000).toISOString(), door_closed: 0 }, noon);
        assert.strictEqual(res.doorOpenTooLong, true);
    });

    test('DRY-RUN default ต้องเป็น true (MVP)', () => {
        assert.strictEqual(config.dryRun, true);
    });

    test('X value default = 10 min (Mnemo ยืนยัน)', () => {
        assert.strictEqual(config.doorSensorTimeoutMin, 10);
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} B4: passed=${passed} failed=${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
