'use strict';

/**
 * @file dry_run_precedence.test.js — Phase 1 (ข้อ 2)
 *
 * Server-side dry-run (SHC_POLICY_DRY_RUN) ต้องมีอำนาจเหนือ body:
 *   body=false + server=true  → dry-run
 *   body=true  + server=false → dry-run
 * และ buildCommand ต้องใช้ค่าที่ resolve แล้ว
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveDryRun, config } = require('../services/shc_policy_config');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS ${name}`);
    } catch (e) {
        failed++;
        console.error(`  FAIL ${name}\n       ${e.message}`);
    }
}

console.log('\n=== Phase 1.2 — dry-run precedence ===');

test('server=true ชนะ body=false', () => {
    assert.strictEqual(resolveDryRun(false, true), true);
    assert.strictEqual(resolveDryRun(undefined, true), true);
});

test('body=true ยังเป็น dry-run แม้ server=false', () => {
    assert.strictEqual(resolveDryRun(true, false), true);
});

test('ทั้งคู่ false → ยิงจริง', () => {
    assert.strictEqual(resolveDryRun(false, false), false);
    assert.strictEqual(resolveDryRun(0, false), false);
});

test('default ใช้ config.dryRun จาก environment', () => {
    const original = config.dryRun;
    try {
        config.dryRun = true;
        assert.strictEqual(resolveDryRun(false), true);
        config.dryRun = false;
        assert.strictEqual(resolveDryRun(false), false);
    } finally {
        config.dryRun = original;
    }
});

test('server.js: buildCommand ใช้ resolveDryRun', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(src, /dryRun:\s*resolveDryRun\(options\.dryRun\)/);
});

test('server.js: 3 routes คำนวณ effectiveDryRun ด้วย resolveDryRun', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(src, /const effectiveDryRun = resolveDryRun\(requestDryRun\);/);
    assert.match(src, /const effectiveDryRun = resolveDryRun\(Boolean\(dryRun\)\);/);
    assert.ok(src.includes("app.post('/api/checkin'"));
    assert.ok(src.includes("app.post('/api/checkout'"));
    assert.ok(src.includes("app.post('/api/rooms/control'"));
});

console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
process.exit(failed === 0 ? 0 : 1);
