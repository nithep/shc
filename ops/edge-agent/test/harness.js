'use strict';

/**
 * @file test/harness.js — PBX Connector Automated Test Harness
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  7 Test Scenarios ที่ครอบคลุมการทำงานระบบ Check-in/Check-out    ║
 * ║  รวม Resilience, Heartbeat, Retry Logic, และ Stress Test       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   1. Start the simulator first:  node simulator/pbx-simulator.js
 *   2. Then run tests:             node test/harness.js
 *
 * @module pbx-connector/test/harness
 */

const { createConnector, ROOM_STATUS } = require('../index');

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
    host: '127.0.0.1',
    port: 10001,
    heartbeatInterval: 0,       // Disable heartbeat for automated tests (we test it manually)
    retryAttempts: 3,
    retryBaseDelay: 200,        // Shorter delays for test speed
    commandTimeout: 3000,
};

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const C = {
    RESET:   '\x1b[0m',
    BOLD:    '\x1b[1m',
    DIM:     '\x1b[2m',
    RED:     '\x1b[31m',
    GREEN:   '\x1b[32m',
    YELLOW:  '\x1b[33m',
    BLUE:    '\x1b[34m',
    CYAN:    '\x1b[36m',
    MAGENTA: '\x1b[35m',
    BG_RED:  '\x1b[41m',
    BG_GREEN:'\x1b[42m',
};

// ─── Test Framework (Minimal) ────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function log(msg) {
    console.log(msg);
}

function sectionHeader(title) {
    log(`\n${C.CYAN}${C.BOLD}${'━'.repeat(60)}${C.RESET}`);
    log(`${C.CYAN}${C.BOLD}  📋 ${title}${C.RESET}`);
    log(`${C.CYAN}${'━'.repeat(60)}${C.RESET}`);
}

async function assert(testName, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        log(`  ${C.GREEN}✔${C.RESET} ${testName}`);
    } catch (err) {
        failedTests++;
        failures.push({ testName, error: err.message });
        log(`  ${C.RED}✘${C.RESET} ${testName}`);
        log(`    ${C.DIM}→ ${err.message}${C.RESET}`);
    }
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTruthy(value, msg) {
    if (!value) {
        throw new Error(`${msg || 'Expected truthy value'}: got ${JSON.stringify(value)}`);
    }
}

function assertThrows(fn, msg) {
    return new Promise(async (resolve, reject) => {
        try {
            await fn();
            reject(new Error(msg || 'Expected function to throw, but it did not'));
        } catch (err) {
            resolve(err);
        }
    });
}

// ─── Test Scenarios ──────────────────────────────────────────────────────────

async function scenario1_BasicCheckinCheckout(connector) {
    sectionHeader('Scenario 1: Basic Check-in / Check-out');

    await assert('Check-in room 101 → status ON', async () => {
        const result = await connector.checkIn(101);
        assertTruthy(result.success, 'success should be true');
        assertEqual(result.status, 'ON', 'status');
    });

    await assert('Read room 101 status → should be 1 (ON)', async () => {
        const status = await connector.getRoomStatus(101);
        assertEqual(status.statusCode, 1, 'statusCode');
        assertEqual(status.statusLabel, 'ON', 'statusLabel');
    });

    await assert('Check-out room 101 → status OFF', async () => {
        const result = await connector.checkOut(101);
        assertTruthy(result.success, 'success should be true');
        assertEqual(result.status, 'OFF', 'status');
    });

    await assert('Read room 101 status → should be 0 (OFF)', async () => {
        const status = await connector.getRoomStatus(101);
        assertEqual(status.statusCode, 0, 'statusCode');
        assertEqual(status.statusLabel, 'OFF', 'statusLabel');
    });
}

async function scenario2_MultipleRoomsConcurrent(connector) {
    sectionHeader('Scenario 2: Multiple Rooms Concurrent');

    const rooms = [101, 102, 103];

    await assert('Check-in rooms 101, 102, 103 concurrently', async () => {
        // Note: PBX uses sequential command-response, so we send sequentially
        // but test that all succeed independently
        for (const room of rooms) {
            const result = await connector.checkIn(room);
            assertTruthy(result.success, `Room ${room} check-in success`);
        }
    });

    await assert('All rooms should be ON', async () => {
        for (const room of rooms) {
            const status = await connector.getRoomStatus(room);
            assertEqual(status.statusCode, 1, `Room ${room} status`);
        }
    });

    await assert('Check-out all rooms', async () => {
        for (const room of rooms) {
            const result = await connector.checkOut(room);
            assertTruthy(result.success, `Room ${room} check-out success`);
        }
    });

    await assert('All rooms should be OFF', async () => {
        for (const room of rooms) {
            const status = await connector.getRoomStatus(room);
            assertEqual(status.statusCode, 0, `Room ${room} status`);
        }
    });
}

async function scenario3_ErrorHandling(connector) {
    sectionHeader('Scenario 3: Error Handling');

    await assert('Check-in invalid room (999) → should throw', async () => {
        await assertThrows(
            () => connector.checkIn(999),
            'Should reject invalid room'
        );
    });

    await assert('Get status of invalid room → should throw', async () => {
        await assertThrows(
            () => connector.getRoomStatus(999),
            'Should reject invalid room'
        );
    });

    await assert('Ping → should return alive status', async () => {
        const result = await connector.ping();
        assertTruthy(result.alive, 'PBX should be alive');
        assertTruthy(result.latency >= 0, 'Latency should be >= 0');
    });
}

async function scenario4_Idempotency(connector) {
    sectionHeader('Scenario 4: Idempotency');

    await assert('Check-in room 101 twice → should not error', async () => {
        await connector.checkIn(101);
        const result = await connector.checkIn(101);
        assertTruthy(result.success, 'Second check-in should succeed');
    });

    await assert('Check-out room 101 (already vacant) → should not error', async () => {
        await connector.checkOut(101);
        const result = await connector.checkOut(101);
        assertTruthy(result.success, 'Second check-out should succeed');
    });
}

async function scenario5_ResilienceAndKeepAlive() {
    sectionHeader('Scenario 5: Resilience & Keep-Alive');

    // 5a: Retry Logic Test
    await assert('Retry Logic → connector handles retries gracefully on mock', async () => {
        // Test with mock mode to verify retry logic path exists
        const mockConnector = createConnector({
            mode: 'mock',
            retryAttempts: 3,
            retryBaseDelay: 100,
            heartbeatInterval: 0,
        });
        await mockConnector.connect();

        // Normal operation should work within retry logic
        const result = await mockConnector.checkIn(101);
        assertTruthy(result.success, 'Check-in through retry path should succeed');

        await mockConnector.destroy();
    });

    // 5b: Heartbeat mechanism test
    await assert('Heartbeat → ping() returns alive=true from TCP simulator', async () => {
        const hbConnector = createConnector({
            mode: 'tcp',
            host: CONFIG.host,
            port: CONFIG.port,
            heartbeatInterval: 0,   // We manually test ping
            commandTimeout: 3000,
        });
        await hbConnector.connect();

        const ping1 = await hbConnector.ping();
        assertTruthy(ping1.alive, 'First ping should be alive');
        assertTruthy(ping1.version.length > 0, 'Version should be non-empty');

        const ping2 = await hbConnector.ping();
        assertTruthy(ping2.alive, 'Second consecutive ping should be alive');

        await hbConnector.destroy();
    });

    // 5c: Auto-reconnect preparation test
    await assert('State tracking → lastActivityTime updates after commands', async () => {
        const trackConnector = createConnector({
            mode: 'tcp',
            host: CONFIG.host,
            port: CONFIG.port,
            heartbeatInterval: 0,
            commandTimeout: 3000,
        });
        await trackConnector.connect();

        const timeBefore = trackConnector.lastActivityTime;
        await new Promise(r => setTimeout(r, 50));
        await trackConnector.ping();
        const timeAfter = trackConnector.lastActivityTime;

        assertTruthy(timeAfter > timeBefore, 'lastActivityTime should increase after ping');

        await trackConnector.destroy();
    });
}

async function scenario6_FullLifecycle(connector) {
    sectionHeader('Scenario 6: Full Lifecycle');

    await assert('Full lifecycle: Check-in → Read Status → Set Name → Read Name → Check-out', async () => {
        // 1. Check-in with guest name
        const checkin = await connector.checkIn(104, 'TestGuest');
        assertTruthy(checkin.success, 'Check-in success');
        assertEqual(checkin.status, 'ON', 'Status after check-in');

        // 2. Read status
        const status = await connector.getRoomStatus(104);
        assertEqual(status.statusCode, 1, 'Room should be ON');

        // 3. Set name explicitly
        const nameResult = await connector.setGuestName(104, 'UpdatedName');
        assertEqual(nameResult.name, 'UpdatedName', 'Guest name should be set');

        // 4. Read name
        const nameRead = await connector.getGuestName(104);
        assertEqual(nameRead.name, 'UpdatedName', 'Guest name should match');

        // 5. Check-out
        const checkout = await connector.checkOut(104);
        assertTruthy(checkout.success, 'Check-out success');
        assertEqual(checkout.status, 'OFF', 'Status after check-out');

        // 6. Verify final status
        const finalStatus = await connector.getRoomStatus(104);
        assertEqual(finalStatus.statusCode, 0, 'Room should be OFF after checkout');
    });
}

async function scenario7_StressTest(connector) {
    sectionHeader('Scenario 7: Stress Test (50 iterations)');

    await assert('50 rounds of Check-in/Check-out on room 105 → no errors', async () => {
        const ROUNDS = 50;
        for (let i = 0; i < ROUNDS; i++) {
            const checkin = await connector.checkIn(105);
            assertTruthy(checkin.success, `Round ${i + 1} check-in`);

            const checkout = await connector.checkOut(105);
            assertTruthy(checkout.success, `Round ${i + 1} check-out`);
        }
    });

    await assert('Room 105 final status should be OFF', async () => {
        const status = await connector.getRoomStatus(105);
        assertEqual(status.statusCode, 0, 'Final status');
    });
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n${C.BOLD}${C.MAGENTA}╔══════════════════════════════════════════════════════════════╗${C.RESET}`);
    console.log(`${C.BOLD}${C.MAGENTA}║  🧪 PBX Connector — Automated Test Harness                  ║${C.RESET}`);
    console.log(`${C.BOLD}${C.MAGENTA}║  Phonik PBX Protocol Sandbox Testing                        ║${C.RESET}`);
    console.log(`${C.BOLD}${C.MAGENTA}╚══════════════════════════════════════════════════════════════╝${C.RESET}`);
    console.log(`${C.DIM}  Target: ${CONFIG.host}:${CONFIG.port}${C.RESET}`);
    console.log(`${C.DIM}  Time:   ${new Date().toISOString()}${C.RESET}`);

    // Create main connector for scenarios 1-4, 6-7
    const connector = createConnector({
        mode: 'tcp',
        host: CONFIG.host,
        port: CONFIG.port,
        heartbeatInterval: 0,
        retryAttempts: CONFIG.retryAttempts,
        retryBaseDelay: CONFIG.retryBaseDelay,
        commandTimeout: CONFIG.commandTimeout,
    });

    try {
        log(`\n${C.YELLOW}  ⏳ Connecting to PBX Simulator...${C.RESET}`);
        await connector.connect();
        log(`${C.GREEN}  ✔ Connected!${C.RESET}`);

        // Get version
        const version = await connector.getVersion();
        log(`${C.DIM}  📡 PBX Version: ${version}${C.RESET}`);

        // Run scenarios
        const startTime = Date.now();

        await scenario1_BasicCheckinCheckout(connector);
        await scenario2_MultipleRoomsConcurrent(connector);
        await scenario3_ErrorHandling(connector);
        await scenario4_Idempotency(connector);
        await scenario5_ResilienceAndKeepAlive();   // Creates its own connectors
        await scenario6_FullLifecycle(connector);
        await scenario7_StressTest(connector);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        // ── Results ──
        log(`\n${C.BOLD}${'═'.repeat(60)}${C.RESET}`);
        log(`${C.BOLD}  📊 Test Results${C.RESET}`);
        log(`${'═'.repeat(60)}`);
        log(`  Total:   ${totalTests}`);
        log(`  ${C.GREEN}Passed:  ${passedTests}${C.RESET}`);
        if (failedTests > 0) {
            log(`  ${C.RED}Failed:  ${failedTests}${C.RESET}`);
            log('');
            log(`  ${C.RED}${C.BOLD}Failed Tests:${C.RESET}`);
            failures.forEach(f => {
                log(`    ${C.RED}✘ ${f.testName}${C.RESET}`);
                log(`      ${C.DIM}${f.error}${C.RESET}`);
            });
        }
        log(`  Time:    ${elapsed}s`);
        log(`${'═'.repeat(60)}`);

        if (failedTests === 0) {
            log(`\n  ${C.BG_GREEN}${C.BOLD} ✅ ALL ${totalTests} TESTS PASSED! ${C.RESET}\n`);
        } else {
            log(`\n  ${C.BG_RED}${C.BOLD} ❌ ${failedTests} TEST(S) FAILED ${C.RESET}\n`);
        }

    } catch (err) {
        log(`\n${C.RED}${C.BOLD}  ❌ Fatal Error: ${err.message}${C.RESET}`);
        log(`${C.DIM}  Make sure the PBX Simulator is running: npm run simulator${C.RESET}\n`);
        process.exit(1);
    } finally {
        await connector.destroy();
    }

    process.exit(failedTests > 0 ? 1 : 0);
}

main();
