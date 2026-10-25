'use strict';

/**
 * Test-only preload: บังคับ StateVerifier ให้ fail ด้วย STATE_MISMATCH
 * ใช้ผ่าน NODE_OPTIONS=--require <ไฟล์นี้> เฉพาะ integration test
 * ไม่มีผลกับ production เพราะโหลดเมื่อตั้ง env เท่านั้น
 */

if (process.env.SHC_TEST_FORCE_STATE_MISMATCH === '1') {
    const StateVerifier = require('../../pbx/safety/StateVerifier');

    StateVerifier.prototype.verify = async function forcedVerify({ room, action, expectedState }) {
        return {
            success: false,
            data: null,
            room,
            action,
            attempts: 1,
            timestamp: new Date().toISOString(),
            lastError: `STATE_MISMATCH: forced by test (expected=${expectedState})`,
        };
    };
}
