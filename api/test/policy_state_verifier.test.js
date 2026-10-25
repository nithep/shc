'use strict';

/**
 * @file policy_state_verifier.test.js — Phase 1 (ข้อ 1)
 *
 * พิสูจน์ว่า PolicyVerifier ส่งคำสั่งเข้า StateVerifier จริงผ่าน API options
 * และ fail closed (DENY, executed=false) เมื่อ state ไม่ตรง โดยไม่บันทึก last relay
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PolicyVerifier, DECISION } = require('../services/policy_verifier');
const { config } = require('../services/shc_policy_config');
const StateVerifier = require('../../pbx/safety/StateVerifier');

let passed = 0;
let failed = 0;

async function testAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  PASS ${name}`);
    } catch (e) {
        failed++;
        console.error(`  FAIL ${name}\n       ${e.message}`);
    }
}

function fixedNoon() {
    return new Date('2026-10-20T14:00:00+07:00').getTime();
}

function makePbx(initialStatus) {
    const state = { statusLabel: initialStatus };
    return {
        isReady: true,
        calls: [],
        async checkOut(room) {
            this.calls.push(['checkOut', String(room)]);
            state.statusLabel = 'OFF';
            return { success: true };
        },
        async checkIn(room) {
            this.calls.push(['checkIn', String(room)]);
            state.statusLabel = 'ON';
            return { success: true };
        },
        async getRoomStatus(room) {
            this.calls.push(['getRoomStatus', String(room)]);
            return { statusLabel: state.statusLabel };
        },
        setStatus(label) {
            state.statusLabel = label;
        },
    };
}

function makeVerifier(pbx, now) {
    const calls = [];
    const real = new StateVerifier(1, 0);
    const hardwareVerifier = {
        async verify(options) {
            calls.push(options);
            return real.verify(options);
        },
    };
    const pv = new PolicyVerifier({ pbx, hardwareVerifier, now: () => now });
    return { pv, calls };
}

function ecoOnRequest(now) {
    return {
        room: '101',
        command: 'eco_on',
        context: { status: 'occupied', power: true, now },
    };
}

(async () => {
    console.log('\n=== Phase 1.1 — PolicyVerifier → StateVerifier wiring ===');
    const originalDryRun = config.dryRun;

    try {
        config.dryRun = false;
        const now = fixedNoon();

        await testAsync('ALLOW → เรียก StateVerifier.verify ด้วย API options และ executed=true', async () => {
            const pbx = makePbx('ON');
            const { pv, calls } = makeVerifier(pbx, now);
            const result = await pv.verifyAndExecute(ecoOnRequest(now));

            assert.strictEqual(result.decision, DECISION.ALLOW);
            assert.strictEqual(result.executed, true);
            assert.strictEqual(result.hardwareResult.success, true);
            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0].room, '101');
            assert.strictEqual(calls[0].action, 'ROOM_OFF');
            assert.strictEqual(calls[0].expectedState, 'OFF');
            assert.strictEqual(typeof calls[0].executeFn, 'function');
            assert.strictEqual(typeof calls[0].isConnectedFn, 'function');
            assert.deepStrictEqual(pbx.calls, [
                ['checkOut', '101'],
                ['getRoomStatus', '101'],
            ]);
            assert.ok(pv._lastRelayAt.has('101'), 'last relay ต้องถูกบันทึกเมื่อสำเร็จ');
        });

        await testAsync('state mismatch → DENY, executed=false และไม่บันทึก last relay', async () => {
            const pbx = makePbx('ON');
            const { pv, calls } = makeVerifier(pbx, now);
            pbx.getRoomStatus = async () => ({ statusLabel: 'ON' });

            const result = await pv.verifyAndExecute(ecoOnRequest(now));

            assert.strictEqual(result.decision, DECISION.DENY);
            assert.strictEqual(result.executed, false);
            assert.strictEqual(result.hardwareResult.success, false);
            assert.match(result.reason, /hardware verification failed/i);
            assert.strictEqual(calls.length, 1);
            assert.strictEqual(pv._lastRelayAt.has('101'), false, 'ห้ามบันทึกว่าสำเร็จ');
        });

        await testAsync('ไม่มี hardwareVerifier → fail closed', async () => {
            const pbx = makePbx('ON');
            const pv = new PolicyVerifier({ pbx, now: () => now });
            const result = await pv.verifyAndExecute(ecoOnRequest(now));

            assert.strictEqual(result.decision, DECISION.DENY);
            assert.strictEqual(result.executed, false);
            assert.match(result.reason, /not wired/i);
            assert.strictEqual(pbx.calls.length, 0);
        });

        await testAsync('server.js inject StateVerifier เข้า PolicyVerifier จริง', async () => {
            const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
            assert.match(src, /const hardwareVerifier = new StateVerifier\(\)/);
            assert.match(src, /new PolicyVerifier\(\{[\s\S]*?hardwareVerifier,[\s\S]*?\}\)/);
        });

        await testAsync('dry-run ต้องไม่แตะ hardware (แม้มี verifier)', async () => {
            config.dryRun = true;
            const pbx = makePbx('ON');
            const { pv, calls } = makeVerifier(pbx, now);
            const result = await pv.verifyAndExecute(ecoOnRequest(now));

            assert.strictEqual(result.dryRun, true);
            assert.strictEqual(result.executed, false);
            assert.strictEqual(calls.length, 0);
            assert.strictEqual(pbx.calls.length, 0);
        });
    } finally {
        config.dryRun = originalDryRun;
    }

    console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
