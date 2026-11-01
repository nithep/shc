'use strict';

const assert = require('assert');
const { runAutoEviction } = require('../services/cron_scheduler');
const { config } = require('../services/shc_policy_config');

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

function expiredRoom() {
    return {
        id: '101',
        status: 'occupied',
        checkout_date: new Date(Date.now() - 60000).toISOString(),
    };
}

function fakeDb(rooms) {
    return {
        getAllRooms: (cb) => cb(null, rooms),
        updateRoomState: (id, status, power, metadata, cb) => cb(null),
    };
}

(async () => {
    console.log('\n=== Auto-eviction dry-run guard ===');
    const originalDryRun = config.dryRun;

    await testAsync('SHC_POLICY_DRY_RUN=true skips pbx.checkOut', async () => {
        config.dryRun = true;
        let calls = 0;
        const pbx = { checkOut: async () => { calls++; return { success: true }; } };

        await runAutoEviction(fakeDb([expiredRoom()]), null, pbx);
        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.strictEqual(calls, 0, 'pbx.checkOut must not be called in dry-run');
    });

    await testAsync('SHC_POLICY_DRY_RUN=false calls pbx.checkOut', async () => {
        config.dryRun = false;
        let calls = 0;
        const pbx = { checkOut: async () => { calls++; return { success: true }; } };

        await runAutoEviction(fakeDb([expiredRoom()]), null, pbx);
        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.strictEqual(calls, 1, 'pbx.checkOut must be called when dry-run is off');
    });

    config.dryRun = originalDryRun;
    console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
    process.exit(failed === 0 ? 0 : 1);
})();
