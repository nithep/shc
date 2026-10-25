'use strict';

/**
 * @file hardware_verification.test.js — shared StateVerifier adapter
 */

const assert = require('assert');
const {
    executeAndVerify,
    expectedStateFor,
    powerFrame,
} = require('../services/hardware_verification');
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

function makePbx(status) {
    const state = { statusLabel: status };
    return {
        isReady: true,
        calls: [],
        async checkIn(room) {
            this.calls.push(['checkIn', room]);
            state.statusLabel = 'ON';
            return { success: true, status: 'ON' };
        },
        async checkOut(room) {
            this.calls.push(['checkOut', room]);
            state.statusLabel = 'OFF';
            return { success: true, status: 'OFF' };
        },
        async getRoomStatus(room) {
            this.calls.push(['getRoomStatus', room]);
            return { statusLabel: state.statusLabel };
        },
    };
}

(async () => {
    console.log('\n=== hardware_verification — shared adapter ===');

    await testAsync('expectedStateFor รองรับ ROOM_ON/OFF + eco', async () => {
        assert.strictEqual(expectedStateFor('ROOM_ON'), 'ON');
        assert.strictEqual(expectedStateFor('ROOM_OFF'), 'OFF');
        assert.strictEqual(expectedStateFor('eco_on'), 'OFF');
        assert.strictEqual(expectedStateFor('eco_off'), 'ON');
        assert.strictEqual(expectedStateFor('DIM'), null);
    });

    await testAsync('powerFrame ใช้รหัสห้องแบบไม่ zero-pad', async () => {
        assert.strictEqual(powerFrame('0101', 'ON'), '==PWER101=on\r\n');
        assert.strictEqual(powerFrame(102, 'OFF'), '==PWER102=off\r\n');
    });

    await testAsync('simulate → เรียก StateVerifier แต่ไม่แตะ pbx', async () => {
        const pbx = makePbx('ON');
        let called = 0;
        const hardwareVerifier = {
            async verify(opts) {
                called++;
                assert.strictEqual(opts.expectedState, 'OFF');
                return new StateVerifier(1, 0).verify(opts);
            },
        };

        const outcome = await executeAndVerify({
            hardwareVerifier,
            pbx,
            room: '101',
            commandType: 'ROOM_OFF',
            simulate: true,
        });

        assert.strictEqual(outcome.success, true);
        assert.strictEqual(outcome.simulated, true);
        assert.strictEqual(called, 1);
        assert.deepStrictEqual(pbx.calls, []);
    });

    await testAsync('real pass → ยิงคำสั่ง + read-back แล้ว verify ผ่าน', async () => {
        const pbx = makePbx('ON');
        const outcome = await executeAndVerify({
            hardwareVerifier: new StateVerifier(1, 0),
            pbx,
            room: '101',
            commandType: 'ROOM_OFF',
            executeFn: () => pbx.checkOut('101'),
        });

        assert.strictEqual(outcome.success, true);
        assert.strictEqual(outcome.simulated, false);
        assert.deepStrictEqual(pbx.calls, [['checkOut', '101'], ['getRoomStatus', '101']]);
        assert.strictEqual(outcome.result.status, 'OFF');
    });

    await testAsync('real mismatch → success=false และไม่คืนผลว่าสำเร็จ', async () => {
        const pbx = makePbx('ON');
        pbx.getRoomStatus = async () => ({ statusLabel: 'ON' });
        const outcome = await executeAndVerify({
            hardwareVerifier: new StateVerifier(1, 0),
            pbx,
            room: '101',
            commandType: 'ROOM_OFF',
            executeFn: () => pbx.checkOut('101'),
        });

        assert.strictEqual(outcome.success, false);
        assert.strictEqual(outcome.verification.success, false);
        assert.match(outcome.reason, /STATE_MISMATCH/i);
    });

    await testAsync('ไม่มี verifier → fail closed โดยไม่ยิง executeFn', async () => {
        let executed = false;
        const outcome = await executeAndVerify({
            hardwareVerifier: null,
            pbx: makePbx('ON'),
            room: '101',
            commandType: 'ROOM_OFF',
            executeFn: async () => { executed = true; return { success: true }; },
        });

        assert.strictEqual(outcome.success, false);
        assert.strictEqual(executed, false);
        assert.match(outcome.reason, /not wired/i);
    });

    console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
