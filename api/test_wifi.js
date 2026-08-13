'use strict';

/**
 * @file backend/test_wifi.js — WiFiService Automated Unit Test Harness
 */

const { WiFiService } = require('./services/wifi_service');

const C = {
  RESET:   '\x1b[0m',
  BOLD:    '\x1b[1m',
  DIM:     '\x1b[2m',
  RED:     '\x1b[31m',
  GREEN:   '\x1b[32m',
  YELLOW:  '\x1b[33m',
  BLUE:    '\x1b[34m',
  CYAN:    '\x1b[36m',
  BG_GREEN:'\x1b[42m',
  BG_RED:  '\x1b[41m',
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function log(msg) {
  console.log(msg);
}

function sectionHeader(title) {
  log(`\n${C.CYAN}${C.BOLD}${'━'.repeat(60)}${C.RESET}`);
  log(`${C.CYAN}${C.BOLD}  📶 ${title}${C.RESET}`);
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

async function main() {
  log(`\n${C.BOLD}${C.BLUE}╔══════════════════════════════════════════════════════════════╗${C.RESET}`);
  log(`${C.BOLD}${C.BLUE}║  🧪 WiFiService Unit Tests (Mock Environment)                ║${C.RESET}`);
  log(`${C.BOLD}${C.BLUE}╚══════════════════════════════════════════════════════════════╝${C.RESET}`);
  log(`${C.DIM}  Time:   ${new Date().toISOString()}${C.RESET}`);

  // Initialize service in mock mode explicitly for testing
  process.env.WIFI_MODE = 'mock';
  const wifi = new WiFiService();

  // Test Scenario 1: Initial Status
  sectionHeader('Scenario 1: Initial State Validation');
  
  await assert('Get default Wi-Fi status', async () => {
    const status = await wifi.getStatus();
    assertTruthy(status.success, 'success should be true');
    assertEqual(status.enabled, true, 'enabled');
    assertEqual(status.connected, true, 'connected');
    assertEqual(status.ssid, 'NT-WIFI_2.4G', 'ssid');
    assertEqual(status.bssid, '88:a2:9e:11:07:fe', 'bssid');
    assertEqual(status.signal, 92, 'signal');
  });

  await assert('Scan available networks', async () => {
    const scan = await wifi.scanNetworks();
    assertTruthy(scan.success, 'success');
    assertTruthy(Array.isArray(scan.networks), 'networks should be an array');
    assertEqual(scan.networks.length, 5, 'networks count');
    // Confirm target network exists
    const ak = scan.networks.find(n => n.ssid === 'AK_2G');
    assertTruthy(ak, 'AK_2G network should exist');
    assertEqual(ak.signal, 48, 'signal of AK_2G');
  });

  // Test Scenario 2: Toggle Radio
  sectionHeader('Scenario 2: WiFi Radio Toggle (ON/OFF)');

  await assert('Toggle Wi-Fi OFF', async () => {
    const result = await wifi.toggleWifi(false);
    assertTruthy(result.success, 'success');
    assertEqual(result.enabled, false, 'enabled');

    const status = await wifi.getStatus();
    assertEqual(status.enabled, false, 'status enabled');
    assertEqual(status.connected, false, 'status connected');
    assertEqual(status.ssid, null, 'status ssid');
  });

  await assert('Scan when Wi-Fi is OFF should return empty list', async () => {
    const scan = await wifi.scanNetworks();
    assertEqual(scan.networks.length, 0, 'networks should be empty');
  });

  await assert('Toggle Wi-Fi back ON', async () => {
    const result = await wifi.toggleWifi(true);
    assertTruthy(result.success, 'success');
    assertEqual(result.enabled, true, 'enabled');

    const status = await wifi.getStatus();
    assertEqual(status.enabled, true, 'status enabled');
  });

  // Test Scenario 3: Disconnect & Connect Flow
  sectionHeader('Scenario 3: Disconnect & Connect Connection Flow');

  await assert('Disconnect from current network', async () => {
    const result = await wifi.disconnect();
    assertTruthy(result.success, 'success');

    const status = await wifi.getStatus();
    assertEqual(status.connected, false, 'connected should be false');
    assertEqual(status.ssid, null, 'ssid should be null');
  });

  await assert('Connect to Redmi 14C (requires password)', async () => {
    const result = await wifi.connect('Redmi 14C', 'password123');
    assertTruthy(result.success, 'success');

    const status = await wifi.getStatus();
    assertEqual(status.connected, true, 'connected');
    assertEqual(status.ssid, 'Redmi 14C', 'ssid');
    assertEqual(status.bssid, '11:22:33:44:55:66', 'bssid');
  });

  await assert('Connect with incorrect password (fail_me) should throw', async () => {
    await assertThrows(
      () => wifi.connect('Redmi 14C', 'fail_me'),
      'Should throw incorrect password error'
    );
  });

  await assert('Connect to Lobby_Guest_WiFi (Open Network - no password)', async () => {
    const result = await wifi.connect('Lobby_Guest_WiFi');
    assertTruthy(result.success, 'success');

    const status = await wifi.getStatus();
    assertEqual(status.connected, true, 'connected');
    assertEqual(status.ssid, 'Lobby_Guest_WiFi', 'ssid');
    assertEqual(status.security, '', 'security should be empty (open)');
  });

  // ── Results Summary ──
  log(`\n${C.BOLD}${'═'.repeat(60)}${C.RESET}`);
  log(`${C.BOLD}  📊 Test Results Summary${C.RESET}`);
  log(`${'═'.repeat(60)}`);
  log(`  Total Scenarios Tested: ${totalTests}`);
  log(`  ${C.GREEN}Passed:                  ${passedTests}${C.RESET}`);
  if (failedTests > 0) {
    log(`  ${C.RED}Failed:                  ${failedTests}${C.RESET}`);
    log('');
    log(`  ${C.RED}${C.BOLD}Failed Assertions:${C.RESET}`);
    failures.forEach(f => {
      log(`    ${C.RED}✘ ${f.testName}${C.RESET}`);
      log(`      ${C.DIM}${f.error}${C.RESET}`);
    });
  }
  log(`${'═'.repeat(60)}`);

  if (failedTests === 0) {
    log(`\n  ${C.BG_GREEN}${C.BOLD} ✅ ALL ${totalTests} TESTS PASSED SUCCESSFUL! ${C.RESET}\n`);
  } else {
    log(`\n  ${C.BG_RED}${C.BOLD} ❌ ${failedTests} TEST(S) FAILED ${C.RESET}\n`);
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

main();
