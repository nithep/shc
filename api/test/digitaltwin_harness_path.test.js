'use strict';

/**
 * @file digitaltwin_harness_path.test.js — Phase 1 (ข้อ 4)
 *
 * พิสูจน์ว่า digitaltwin_looptest ชี้ไปยัง ops/worker/harness_loop.py จริง
 * และรันด้วย cwd = ops (ตำแหน่งที่ harness เขียน worker/harness_telemetry.log)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const apiDir = path.join(__dirname, '..');
const repoRoot = path.join(apiDir, '..');
const source = fs.readFileSync(path.join(apiDir, 'digitaltwin_looptest.js'), 'utf8');

console.log('\n=== Phase 1.4 — digitaltwin harness path ===');

test('ไม่เรียก worker/harness_loop.py แบบ relative cwd เดิม', () => {
    assert.strictEqual(source.includes("execSync('python worker/harness_loop.py'"), false);
});

test('มี ops/worker/harness_loop.py อยู่จริง', () => {
    assert.ok(fs.existsSync(path.join(repoRoot, 'ops', 'worker', 'harness_loop.py')));
});

test('ใช้ execFileSync + path/cwd จาก ops', () => {
    assert.match(source, /execFileSync/);
    assert.match(source, /path\.join\(__dirname, '\.\.', 'ops'\)/);
    assert.match(source, /'worker', 'harness_loop\.py'/);
    assert.match(source, /cwd:\s*opsDir/);
});

test('เลือก python ให้เหมาะกับ platform และ override ผ่าน PYTHON ได้', () => {
    assert.match(source, /process\.env\.PYTHON/);
    assert.match(source, /python3/);
});

console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`} (${passed} passed)\n`);
process.exit(failed === 0 ? 0 : 1);
