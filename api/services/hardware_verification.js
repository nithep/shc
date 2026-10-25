'use strict';

/**
 * @file hardware_verification.js — shared StateVerifier adapter
 *
 * ใช้ร่วมกันทั้ง PolicyVerifier (cron/idle), HTTP command routes
 * (/api/checkin, /api/checkout, /api/rooms/control), external API
 * และ approval execute เพื่อให้ทุกเส้นทางตรวจ state จริงแบบเดียวกัน
 */

const { TERMINATOR } = require('../../pbx/protocol');

const ON_COMMANDS = new Set(['ROOM_ON', 'ALL_ROOM_ON', 'ON']);
const OFF_COMMANDS = new Set(['ROOM_OFF', 'ALL_ROOM_OFF', 'OFF']);

function expectedStateFor(commandType) {
    const value = String(commandType || '');
    if (value === 'eco_on') return 'OFF';
    if (value === 'eco_off') return 'ON';
    if (ON_COMMANDS.has(value)) return 'ON';
    if (OFF_COMMANDS.has(value)) return 'OFF';
    return null;
}

function powerFrame(room, statusLabel) {
    const cleanRoom = String(room).replace(/^0+/, '') || '0';
    return `==PWER${cleanRoom}=${String(statusLabel).toLowerCase()}${TERMINATOR}`;
}

function failed(reason, extra = {}) {
    return {
        success: false,
        simulated: false,
        reason,
        verification: null,
        result: null,
        ...extra,
    };
}

/**
 * ยิงคำสั่ง (หรือจำลอง) แล้วยืนยัน state ผ่าน StateVerifier
 *
 * โหมด simulate จะไม่แตะ pbx เลย — ใช้ frame จำลองตาม expectedState
 * เพื่อพิสูจน์ว่า safety path ถูกเรียกและผ่านในโหมด dry-run
 *
 * @param {Object} options
 * @param {Object} options.hardwareVerifier - StateVerifier instance
 * @param {Object} options.pbx - PBX connector (required เมื่อ simulate=false)
 * @param {string} options.room
 * @param {string} [options.commandType] - ROOM_ON/ROOM_OFF/eco_on/eco_off
 * @param {string} [options.action] - label สำหรับ log (default = commandType)
 * @param {'ON'|'OFF'} [options.expectedState]
 * @param {Function} [options.executeFn] - async fn ที่ยิงคำสั่งจริง
 * @param {boolean} [options.simulate=false]
 * @returns {Promise<{success:boolean,simulated:boolean,verification:Object|null,result:*,reason?:string}>}
 */
async function executeAndVerify({
    hardwareVerifier,
    pbx,
    room,
    commandType,
    action,
    expectedState,
    executeFn,
    simulate = false,
}) {
    const expected = expectedState || expectedStateFor(commandType);

    if (!room && room !== 0) {
        return failed('room is required', { simulated: !!simulate });
    }
    if (!expected) {
        return failed(`unsupported command for state verification: ${commandType || action || 'unknown'}`, { simulated: !!simulate });
    }
    if (!hardwareVerifier || typeof hardwareVerifier.verify !== 'function') {
        return failed('hardware verifier not wired (fail closed)', { simulated: !!simulate });
    }

    const actionLabel = action || commandType || expected;

    try {
        if (simulate) {
            const verification = await hardwareVerifier.verify({
                room,
                action: actionLabel,
                expectedState: expected,
                executeFn: async () => powerFrame(room, expected),
            });
            return {
                success: !!verification && verification.success === true,
                simulated: true,
                verification,
                result: { success: true, status: 'DRY_RUN_SIMULATED', expectedState: expected },
                reason: verification && verification.success ? undefined : (verification && verification.lastError) || 'simulated state verification failed',
            };
        }

        if (!pbx) {
            return failed('no pbx wired');
        }
        if (typeof executeFn !== 'function') {
            return failed('executeFn is required');
        }

        let lastResult = null;
        const verification = await hardwareVerifier.verify({
            room,
            action: actionLabel,
            expectedState: expected,
            executeFn: async () => {
                const result = await executeFn();
                if (result && result.success === false) {
                    throw new Error('PBX command returned unsuccessful result');
                }
                lastResult = result;

                const status = await pbx.getRoomStatus(room);
                const label = status && status.statusLabel;
                if (label !== 'ON' && label !== 'OFF') {
                    throw new Error('PBX read-back did not return ON/OFF');
                }
                return powerFrame(room, label);
            },
            isConnectedFn: () => pbx.isReady !== false,
        });

        return {
            success: !!verification && verification.success === true,
            simulated: false,
            verification,
            result: lastResult,
            reason: verification && verification.success ? undefined : (verification && verification.lastError) || 'state verification failed',
        };
    } catch (e) {
        return failed(`hardware verification error: ${e.message}`, { simulated: !!simulate });
    }
}

module.exports = {
    executeAndVerify,
    expectedStateFor,
    powerFrame,
};
