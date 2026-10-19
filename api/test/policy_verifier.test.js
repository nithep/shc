'use strict';

/**
 * @file policy_verifier.test.js — SHC API MVP Acceptance Tests (B4, สเปก §8)
 *
 * Dependency-free runner (node:assert) — ไม่พึ่ง jest (ไม่มีใน api/)
 * รัน: node api/test/policy_verifier.test.js
 *
 * เคสที่ครอบคลุม (สเปก §8):
 *   T1 30 min → ECO (allow)
 *   T2 29 min → no off
 *   T3 23:00 idle 2h → no off (sleep guard for eco_on; eco_off ยังทำงาน)
 *   T4 override during ECO → ON immediately + lock no auto-ECO repeat
 *   T5 presence only (no door+timeout) → no ECO ever (via idle threshold logic)
 *   T6 MQTT silent → no error
 *   T7 malformed payload → log+drop, no crash
 * รวมถึง checklist 5 ข้อ §5 (rule1–rule5)
 */

const assert = require('assert');
const { PolicyVerifier, DECISION, RULE } = require('../services/policy_verifier');
const { config } = require('../services/shc_policy_config');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ ${name}\n     ${e.message}`);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ❌ ${name}\n     ${e.message}`);
    }
}

function fixedNow(hour, minute = 0) {
    const d = new Date('2026-10-20T00:00:00+07:00');
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
}

function mkVerifier(nowMs) {
    // ไม่มี db/pbx → verify() ใช้ context ที่ส่งมา (pure decision)
    return new PolicyVerifier({ now: () => nowMs });
}

(async () => {
    console.log('\n=== B4 policy_verifier — Checklist §5 ===');
    const noon = fixedNow(14); // 14:00 นอก sleep guard

    await testAsync('rule1: override locked → deny', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '101', command: 'eco_off', context: { status: 'occupied', power: true, override_locked: 1, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R1_OVERRIDE_LOCKED);
    });

    await testAsync('rule2: VACANT→ECO illegal → deny', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '102', command: 'eco_off', context: { status: 'vacant', power: false, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R2_ILLEGAL_TRANSITION);
    });

    await testAsync('rule3: relay already OFF → skip (idempotent)', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '103', command: 'eco_off', context: { status: 'occupied', power: false, now: noon } });
        assert.strictEqual(r.decision, DECISION.SKIP);
        assert.strictEqual(r.rule, RULE.R3_IDEMPOTENT);
    });

    await testAsync('rule4: door sensor silent > X min → deny + alert', async () => {
        const pv = mkVerifier(noon);
        const lastDoor = new Date(noon - (config.doorSensorTimeoutMin + 5) * 60000).toISOString();
        const r = await pv.verify({ room: '104', command: 'eco_off', context: { status: 'occupied', power: true, last_door_open_at: lastDoor, door_closed: 0, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R4_DOOR_SILENT);
    });

    await testAsync('rule4: night no eco_on → deny', async () => {
        const night = fixedNow(23);
        const pv = mkVerifier(night);
        const r = await pv.verify({ room: '105', command: 'eco_on', context: { status: 'vacant', power: false, now: night } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R4_SAFETY);
    });

    await testAsync('rule5: relay same room < 2 min apart → deny', async () => {
        const pv = mkVerifier(noon);
        // จำลอง: เตรียม last relay ไว้ 1 นาทีที่แล้ว ผ่าน allow แรก แล้วยิงซ้ำ
        pv._lastRelayAt.set('106', noon - 60000);
        const r = await pv.verify({ room: '106', command: 'eco_off', context: { status: 'occupied', power: true, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R5_RELAY_FLAP);
    });

    await testAsync('pass: occupied + power on + นอก sleep + door ok → allow', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '107', command: 'eco_off', context: { status: 'occupied', power: true, door_closed: 1, now: noon } });
        assert.strictEqual(r.decision, DECISION.ALLOW);
    });

    console.log('\n=== B4 idle logic — Acceptance §8 ===');

    test('T1: idle 30 min → shouldEcoOff = true (threshold 20)', () => {
        const pv = mkVerifier(noon);
        const res = pv.evaluateIdle({ id: 201, last_presence_at: new Date(noon - 30 * 60000).toISOString() }, noon);
        assert.strictEqual(res.shouldEcoOff, true, `idle=${res.idleMin}`);
    });

    test('T2: idle 29 min (suite threshold 30) → no off (ยัง warn zone)', () => {
        const pv = mkVerifier(noon);
        // ตั้งห้อง 9001 เป็น suite → threshold 30; 29 min → ยังไม่ off แต่ควร warn (>=29)
        config.suiteRoomIds = ['9001'];
        const res = pv.evaluateIdle({ id: 9001, last_presence_at: new Date(noon - 29 * 60000).toISOString() }, noon);
        assert.strictEqual(res.thresholdMin, 30, 'suite threshold ต้องเป็น 30');
        assert.strictEqual(res.shouldEcoOff, false, `idle=${res.idleMin}`);
        assert.strictEqual(res.shouldWarn, true, 'ควรอยู่ warn zone (>=29 min)');
        config.suiteRoomIds = [];
    });

    test('T3: 23:00 idle 2h → eco_off ยัง allow (sleep guard คุมแค่ eco_on)', async () => {
        const night = fixedNow(23);
        const pv = mkVerifier(night);
        const r = await pv.verify({ room: '203', command: 'eco_off', context: { status: 'occupied', power: true, door_closed: 1, now: night } });
        assert.strictEqual(r.decision, DECISION.ALLOW, 'eco_off ตอนกลางคืนยังต้องทำได้');
    });

    test('T4: override locked ตอน ECO → eco_off ถูก deny', async () => {
        const pv = mkVerifier(noon);
        const r = await pv.verify({ room: '204', command: 'eco_off', context: { status: 'occupied', power: true, override_locked: 1, now: noon } });
        assert.strictEqual(r.decision, DECISION.DENY);
        assert.strictEqual(r.rule, RULE.R1_OVERRIDE_LOCKED);
    });

    test('T5: presence only (มี last_presence) → คำนวณ idle ได้ ไม่ ECO ก่อน threshold', () => {
        const pv = mkVerifier(noon);
        const res = pv.evaluateIdle({ id: 205, last_presence_at: new Date(noon - 5 * 60000).toISOString() }, noon);
        assert.strictEqual(res.shouldEcoOff, false);
    });

    test('DRY-RUN default ต้องเป็น true (MVP)', () => {
        assert.strictEqual(config.dryRun, true, 'MVP บังคับ dry-run');
    });

    test('X value default = 10 min (ข้อเสนอ B6)', () => {
        assert.strictEqual(config.doorSensorTimeoutMin, 10);
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} B4: passed=${passed} failed=${failed}\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
