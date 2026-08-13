'use strict';

/**
 * @file test/test-loop.js — Continuous Realistic Traffic Simulation
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  จำลองโรงแรมจริง: สุ่ม Check-in/Check-out ห้องต่าง ๆ          ║
 * ║  ทุก 2-5 วินาที พร้อมแสดง Live Stats บน terminal              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   1. Start simulator:  node simulator/pbx-simulator.js
 *   2. Start test loop:  node test/test-loop.js [--iterations N]
 *
 * @module pbx-connector/test/test-loop
 */

const { createConnector } = require('../index');

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
    host: '127.0.0.1',
    port: 10001,
    rooms: [101, 102, 103, 104, 105, 106],
    minIntervalMs: 2000,
    maxIntervalMs: 5000,
    defaultIterations: 50,
    heartbeatInterval: 15000,   // 15s heartbeat during loop
    commandTimeout: 5000,
    retryAttempts: 3,
    retryBaseDelay: 500,
};

// ─── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let maxIterations = CONFIG.defaultIterations;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) {
        maxIterations = parseInt(args[++i], 10);
    }
}

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
    WHITE:   '\x1b[37m',
    BG_GREEN:'\x1b[42m',
    BG_RED:  '\x1b[41m',
    CLEAR:   '\x1b[2J',
    HOME:    '\x1b[H',
};

// ─── Stats Tracking ──────────────────────────────────────────────────────────

const stats = {
    totalCommands: 0,
    successCount: 0,
    failCount: 0,
    nackCount: 0,
    checkins: 0,
    checkouts: 0,
    pings: 0,
    totalLatencyMs: 0,
    startTime: Date.now(),
    lastAction: '',
    iteration: 0,
};

/** Track current room states for display */
const roomStates = {};
CONFIG.rooms.forEach(r => { roomStates[r] = { status: 'OFF', guest: '' }; });

// ─── Guest Name Generator ────────────────────────────────────────────────────

const FIRST_NAMES = ['John', 'Jane', 'Bob', 'Alice', 'Tom', 'Mia', 'Leo', 'Sara', 'Max', 'Lily'];
const LAST_NAMES  = ['Smith', 'Wong', 'Kim', 'Tanaka', 'Lopez', 'Patel', 'Chen', 'Muller'];

function randomGuest() {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last  = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return `${first} ${last}`;
}

function randomRoom() {
    return CONFIG.rooms[Math.floor(Math.random() * CONFIG.rooms.length)];
}

function randomInterval() {
    return CONFIG.minIntervalMs + Math.floor(Math.random() * (CONFIG.maxIntervalMs - CONFIG.minIntervalMs));
}

// ─── Dashboard Renderer ─────────────────────────────────────────────────────

function renderDashboard() {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const avgLatency = stats.totalCommands > 0
        ? (stats.totalLatencyMs / stats.totalCommands).toFixed(1)
        : '0.0';

    let output = '';
    output += `${C.CLEAR}${C.HOME}`;
    output += `${C.BOLD}${C.MAGENTA}╔══════════════════════════════════════════════════════════════╗${C.RESET}\n`;
    output += `${C.BOLD}${C.MAGENTA}║  🔄 PBX Test Loop — Continuous Traffic Simulation           ║${C.RESET}\n`;
    output += `${C.BOLD}${C.MAGENTA}╚══════════════════════════════════════════════════════════════╝${C.RESET}\n\n`;

    // ── Progress ──
    const progress = Math.min(100, Math.round((stats.iteration / maxIterations) * 100));
    const barLen = 40;
    const filled = Math.round(barLen * progress / 100);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(barLen - filled)}`;
    output += `  ${C.CYAN}Progress:${C.RESET} [${C.GREEN}${bar}${C.RESET}] ${progress}% (${stats.iteration}/${maxIterations})\n`;
    output += `  ${C.CYAN}Elapsed:${C.RESET}  ${elapsed}s   ${C.CYAN}Avg Latency:${C.RESET} ${avgLatency}ms\n\n`;

    // ── Room States Table ──
    output += `  ${C.BOLD}┌────────┬──────────┬──────────────────┐${C.RESET}\n`;
    output += `  ${C.BOLD}│ Room   │ Status   │ Guest            │${C.RESET}\n`;
    output += `  ${C.BOLD}├────────┼──────────┼──────────────────┤${C.RESET}\n`;

    for (const room of CONFIG.rooms) {
        const s = roomStates[room];
        const statusColor = s.status === 'ON' ? C.GREEN : C.RED;
        const statusIcon = s.status === 'ON' ? '🟢' : '🔴';
        const guest = (s.guest || '—').padEnd(16);
        output += `  │ ${String(room).padEnd(6)} │ ${statusIcon} ${statusColor}${s.status.padEnd(5)}${C.RESET} │ ${guest} │\n`;
    }
    output += `  ${C.BOLD}└────────┴──────────┴──────────────────┘${C.RESET}\n\n`;

    // ── Stats ──
    output += `  ${C.BOLD}📊 Stats${C.RESET}\n`;
    output += `  ${C.GREEN}✔ Success:${C.RESET} ${stats.successCount}   `;
    output += `${C.RED}✘ Failed:${C.RESET} ${stats.failCount}   `;
    output += `${C.YELLOW}⚠ NACK:${C.RESET} ${stats.nackCount}\n`;
    output += `  ${C.BLUE}↗ Check-ins:${C.RESET} ${stats.checkins}   `;
    output += `${C.BLUE}↙ Check-outs:${C.RESET} ${stats.checkouts}   `;
    output += `${C.DIM}🏓 Pings:${C.RESET} ${stats.pings}\n\n`;

    // ── Last Action ──
    if (stats.lastAction) {
        output += `  ${C.DIM}Last: ${stats.lastAction}${C.RESET}\n`;
    }

    output += `\n  ${C.DIM}Press Ctrl+C to stop${C.RESET}\n`;

    process.stdout.write(output);
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

async function main() {
    const connector = createConnector({
        mode: 'tcp',
        host: CONFIG.host,
        port: CONFIG.port,
        heartbeatInterval: CONFIG.heartbeatInterval,
        retryAttempts: CONFIG.retryAttempts,
        retryBaseDelay: CONFIG.retryBaseDelay,
        commandTimeout: CONFIG.commandTimeout,
    });

    // Listen for heartbeat events
    connector.on('heartbeat', () => {
        stats.pings++;
    });

    connector.on('error', (err) => {
        stats.lastAction = `⚠ Error: ${err.message}`;
    });

    // ── Connect ──
    try {
        await connector.connect();
    } catch (err) {
        console.error(`${C.RED}❌ Cannot connect to simulator at ${CONFIG.host}:${CONFIG.port}${C.RESET}`);
        console.error(`${C.DIM}Start the simulator first: npm run simulator${C.RESET}`);
        process.exit(1);
    }

    // ── Graceful shutdown ──
    let running = true;
    process.on('SIGINT', async () => {
        running = false;
        console.log(`\n${C.YELLOW}  ⏹ Stopping test loop...${C.RESET}`);
        await connector.destroy();
        printFinalReport();
        process.exit(0);
    });

    // ── Main Loop ──
    renderDashboard();

    for (let i = 0; i < maxIterations && running; i++) {
        stats.iteration = i + 1;
        const room = randomRoom();
        const currentState = roomStates[room];
        const startTime = Date.now();

        try {
            if (currentState.status === 'OFF') {
                // Check-in
                const guest = randomGuest();
                const result = await connector.checkIn(room, guest);
                const latency = Date.now() - startTime;

                stats.totalCommands++;
                stats.successCount++;
                stats.checkins++;
                stats.totalLatencyMs += latency;
                roomStates[room] = { status: 'ON', guest };
                stats.lastAction = `✔ Check-in Room ${room} (${guest}) [${latency}ms]`;
            } else {
                // Check-out
                const result = await connector.checkOut(room);
                const latency = Date.now() - startTime;

                stats.totalCommands++;
                stats.successCount++;
                stats.checkouts++;
                stats.totalLatencyMs += latency;
                roomStates[room] = { status: 'OFF', guest: '' };
                stats.lastAction = `✔ Check-out Room ${room} [${latency}ms]`;
            }
        } catch (err) {
            stats.totalCommands++;
            stats.failCount++;
            if (err.message.includes('NACK')) {
                stats.nackCount++;
            }
            stats.lastAction = `✘ Failed Room ${room}: ${err.message}`;
        }

        renderDashboard();

        // Wait random interval before next action
        if (i < maxIterations - 1 && running) {
            await new Promise(r => setTimeout(r, randomInterval()));
        }
    }

    // ── Done ──
    await connector.destroy();
    printFinalReport();
}

function printFinalReport() {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const avgLatency = stats.totalCommands > 0
        ? (stats.totalLatencyMs / stats.totalCommands).toFixed(1)
        : '0.0';

    console.log(`\n${C.BOLD}${'═'.repeat(60)}${C.RESET}`);
    console.log(`${C.BOLD}  📊 Final Report — Test Loop Complete${C.RESET}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Iterations:    ${stats.iteration}/${maxIterations}`);
    console.log(`  Duration:      ${elapsed}s`);
    console.log(`  Avg Latency:   ${avgLatency}ms`);
    console.log(`  ${C.GREEN}✔ Success:${C.RESET}     ${stats.successCount}`);
    console.log(`  ${C.RED}✘ Failed:${C.RESET}      ${stats.failCount}`);
    console.log(`  Check-ins:     ${stats.checkins}`);
    console.log(`  Check-outs:    ${stats.checkouts}`);
    console.log(`  Heartbeats:    ${stats.pings}`);
    console.log(`${'═'.repeat(60)}`);

    if (stats.failCount === 0) {
        console.log(`\n  ${C.BG_GREEN}${C.BOLD} ✅ ALL ${stats.totalCommands} COMMANDS SUCCESSFUL ${C.RESET}\n`);
    } else {
        console.log(`\n  ${C.BG_RED}${C.BOLD} ⚠ ${stats.failCount} COMMAND(S) FAILED ${C.RESET}\n`);
    }
}

main().catch(err => {
    console.error(`${C.RED}Fatal error: ${err.message}${C.RESET}`);
    process.exit(1);
});
