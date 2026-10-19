'use strict';

/**
 * @file run_all.js — SHC API MVP test runner (dependency-free)
 *
 * รัน: node api/test/run_all.js  (หรือ npm run test:shc)
 * เรียกแต่ละ test file เป็น process แยก แล้วสรุปผลรวม
 */

const { spawnSync } = require('child_process');
const path = require('path');

const FILES = [
    'migration.test.js',
    'policy_verifier.test.js',
    'presence_subscriber.test.js',
    'cron_idle_checker.test.js',
];

let failed = 0;

for (const f of FILES) {
    const full = path.join(__dirname, f);
    console.log(`\n──────── ${f} ────────`);
    const res = spawnSync(process.execPath, [full], { stdio: 'inherit' });
    if (res.status !== 0) failed++;
}

console.log(`\n${failed === 0 ? '✅ ALL SHC TESTS PASSED' : `❌ ${failed} test file(s) failed`}\n`);
process.exit(failed === 0 ? 0 : 1);
