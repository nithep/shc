#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Phonik PBX ECS-103R V.5 — TCP Simulator (Digital Twin)               ║
 * ║  Hotel Smart Check-in System                                          ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  This simulator faithfully replicates the TEXT-BASED ASCII protocol    ║
 * ║  of the real Phonik PBX over TCP. It maintains in-memory room state   ║
 * ║  and provides a live terminal dashboard for debugging & development.   ║
 * ║                                                                       ║
 * ║  Protocol:                                                            ║
 * ║    Command prefix : `..`  (two dots) — incoming from client           ║
 * ║    Response prefix: `=>`  — PBX reply to client                       ║
 * ║    Error response : `=NACK`                                           ║
 * ║    Line terminator: `\r\n`                                            ║
 * ║                                                                       ║
 * ║  Usage:                                                               ║
 * ║    node pbx-simulator.js [options]                                    ║
 * ║      --port <port>         TCP port (default: 10001)                  ║
 * ║      --delay <ms>          Artificial latency in ms (default: 0)      ║
 * ║      --drop-rate <0.0-1.0> Probability of dropping response           ║
 * ║      --nack-room <room>    Room that always returns NACK              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * @author  Hotel ECS Integration Team
 * @version 2.0.0
 * @license MIT
 */

'use strict';

// ============================================================================
// IMPORTS — Node.js built-in modules ONLY (no external dependencies)
// ============================================================================
const net = require('net');
const os = require('os');

// ============================================================================
// ANSI ESCAPE CODES — For terminal colors, styles, and cursor control
// ============================================================================
const ANSI = {
    // Cursor & Screen
    CLEAR:       '\x1b[2J',       // Clear entire screen
    HOME:        '\x1b[H',        // Move cursor to top-left (1,1)
    HIDE_CURSOR: '\x1b[?25l',     // Hide cursor for cleaner dashboard
    SHOW_CURSOR: '\x1b[?25h',     // Show cursor (restored on exit)

    // Text Styles
    RESET:     '\x1b[0m',
    BOLD:      '\x1b[1m',
    DIM:       '\x1b[2m',
    ITALIC:    '\x1b[3m',
    UNDERLINE: '\x1b[4m',

    // Foreground Colors
    BLACK:   '\x1b[30m',
    RED:     '\x1b[31m',
    GREEN:   '\x1b[32m',
    YELLOW:  '\x1b[33m',
    BLUE:    '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN:    '\x1b[36m',
    WHITE:   '\x1b[37m',

    // Bright Foreground
    BRIGHT_BLACK:   '\x1b[90m',
    BRIGHT_RED:     '\x1b[91m',
    BRIGHT_GREEN:   '\x1b[92m',
    BRIGHT_YELLOW:  '\x1b[93m',
    BRIGHT_BLUE:    '\x1b[94m',
    BRIGHT_MAGENTA: '\x1b[95m',
    BRIGHT_CYAN:    '\x1b[96m',
    BRIGHT_WHITE:   '\x1b[97m',

    // Background Colors
    BG_BLACK:   '\x1b[40m',
    BG_RED:     '\x1b[41m',
    BG_GREEN:   '\x1b[42m',
    BG_YELLOW:  '\x1b[43m',
    BG_BLUE:    '\x1b[44m',
    BG_MAGENTA: '\x1b[45m',
    BG_CYAN:    '\x1b[46m',
    BG_WHITE:   '\x1b[47m',

    BG_BRIGHT_BLACK: '\x1b[100m',
};

// ============================================================================
// CLI ARGUMENT PARSING — Extract --port, --delay, --drop-rate, --nack-room
// ============================================================================

/**
 * Parse command-line arguments into a configuration object.
 * Supports: --port, --delay, --drop-rate, --nack-room
 * @returns {Object} Parsed configuration
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        port:     10001,   // Default TCP port
        delay:    0,       // Artificial latency in milliseconds
        dropRate: 0.0,     // Probability of dropping response (0.0 = never, 1.0 = always)
        nackRoom: null,    // Room number that always returns NACK (null = disabled)
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port':
                config.port = parseInt(args[++i], 10);
                if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
                    console.error(`[ERROR] Invalid port: ${args[i]}. Must be 1-65535.`);
                    process.exit(1);
                }
                break;

            case '--delay':
                config.delay = parseInt(args[++i], 10);
                if (isNaN(config.delay) || config.delay < 0) {
                    console.error(`[ERROR] Invalid delay: ${args[i]}. Must be >= 0.`);
                    process.exit(1);
                }
                break;

            case '--drop-rate':
                config.dropRate = parseFloat(args[++i]);
                if (isNaN(config.dropRate) || config.dropRate < 0.0 || config.dropRate > 1.0) {
                    console.error(`[ERROR] Invalid drop-rate: ${args[i]}. Must be 0.0-1.0.`);
                    process.exit(1);
                }
                break;

            case '--nack-room':
                config.nackRoom = args[++i];
                break;

            case '--help':
            case '-h':
                console.log(`
  Phonik PBX Simulator — Hotel Smart Check-in System

  Usage: node pbx-simulator.js [options]

  Options:
    --port <port>         TCP listening port (default: 10001)
    --delay <ms>          Artificial response latency in ms (default: 0)
    --drop-rate <0.0-1.0> Probability of silently dropping a response (default: 0.0)
    --nack-room <room>    Room number that always returns NACK
    --help, -h            Show this help message
                `);
                process.exit(0);
                break;

            default:
                console.error(`[WARN] Unknown argument: ${args[i]}`);
        }
    }

    return config;
}

const CONFIG = parseArgs();

// ============================================================================
// IN-MEMORY ROOM STATE — Simulates PBX internal state for rooms 101-106
// ============================================================================

/**
 * Room state structure:
 *   status: 0=OFF, 1=ON, 2=Maintenance, 3=Out-of-Order (OOO)
 *   name:   Guest name (max 16 chars)
 *   wake:   Wakeup time in 'hhmm' format or '0' (disabled) or '' (not set)
 *   lock:   Lock state (0=unlocked, 1=locked)
 *   lang:   Language code (1=default)
 */
const rooms = {};

/** Valid room numbers in this simulator */
const VALID_ROOMS = ['101', '102', '103', '104', '105', '106'];

/**
 * Normalize room number — strip leading zeros so both '0101' and '101' map to '101'.
 * This ensures compatibility with connectors that zero-pad to 4 digits.
 * @param {string} roomStr - Room number string (e.g. '0101', '101')
 * @returns {string} Normalized room number (e.g. '101')
 */
function normalizeRoomNum(roomStr) {
    return roomStr.replace(/^0+/, '') || '0';
}

// Initialize all rooms with default state
VALID_ROOMS.forEach(roomNum => {
    rooms[roomNum] = {
        status: 0,      // OFF
        name:   '',      // No guest
        wake:   '',      // No wakeup call
        lock:   0,       // Unlocked
        lang:   1,       // Default language
    };
});

// ============================================================================
// CONNECTION TRACKING — Track active TCP clients
// ============================================================================

/** @type {Set<net.Socket>} Active client sockets */
const activeConnections = new Set();

/** Command log — stores last N commands for the dashboard */
const MAX_LOG_ENTRIES = 10;
const commandLog = [];

/** Server statistics */
const stats = {
    totalConnections:  0,
    totalCommands:     0,
    totalNacks:        0,
    totalDropped:      0,
    startTime:         Date.now(),
};

// ============================================================================
// LOGGING UTILITY
// ============================================================================

/**
 * Format a timestamp for log output.
 * @returns {string} ISO-like timestamp string
 */
function timestamp() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Add an entry to the command log (ring buffer of MAX_LOG_ENTRIES).
 * @param {string} clientAddr - Client IP:port
 * @param {string} command    - Raw command received
 * @param {string} response   - Response sent (or '[DROPPED]')
 */
function logCommand(clientAddr, command, response) {
    const entry = {
        time:     new Date().toLocaleTimeString('th-TH', { hour12: false }),
        client:   clientAddr,
        command:  command.trim(),
        response: response.trim(),
    };

    commandLog.push(entry);
    if (commandLog.length > MAX_LOG_ENTRIES) {
        commandLog.shift(); // Remove oldest entry
    }

    stats.totalCommands++;

    // Refresh the dashboard after state changes
    renderDashboard();
}

// ============================================================================
// PHONIK PROTOCOL COMMAND PROCESSOR
// ============================================================================

/**
 * Status code to human-readable label mapping.
 */
const STATUS_LABELS = {
    0: 'OFF',
    1: 'ON',
    2: 'MAINT',
    3: 'OOO',
};

/**
 * Process a single Phonik PBX command and return the response string.
 *
 * Protocol Reference:
 *   ..ROOMnumb=r    → Set room status      → =>ROOMnumb=r
 *   ..ROOMnumb=     → Read room status      → =>ROOMnumb=r
 *   ..NAMEnumb=name → Set guest name        → =>NAMEnumb=name
 *   ..NAMEnumb=     → Read guest name       → =>NAMEnumb=name
 *   ..VERS=         → Version query         → =>VERS=DX-COMPACT V5.Super Diamond-32C
 *   ..STOP          → Stop/disconnect       → =>STOP
 *   ..WAKEnumb=hhmm → Set wakeup            → =>WAKEnumb=hhmm
 *   ..WAKEnumb=0    → Cancel wakeup         → =>WAKEnumb=0
 *   ..LOCKnumb=k    → Set lock state        → =>LOCKnumb=k
 *   ..LANGnumb=i    → Set language           → =>LANGnumb=i
 *
 * @param {string} rawCommand - Raw command string (with `..` prefix, without \r\n)
 * @returns {{ response: string, shouldClose: boolean }}
 */
function processCommand(rawCommand) {
    // Strip any leading/trailing whitespace
    const cmd = rawCommand.trim();

    // ── Validate command prefix ──
    if (!cmd.startsWith('..')) {
        return { response: '==NACK', shouldClose: false };
    }

    // Remove the `..` prefix for easier parsing
    const body = cmd.substring(2);

    // ── VERS command (Supports VERS= and VERS) ──
    if (body === 'VERS=' || body === 'VERS') {
        return {
            response: '==VERS=DX-COMPACT V5.Super Diamond-32C',
            shouldClose: false,
        };
    }

    // ── PC Operator Handshake Commands ──
    if (body === 'tcmd=1') {
        return { response: '==tcmd=1', shouldClose: false };
    }
    if (body.startsWith('PASS=')) {
        const pass = body.substring(5);
        return { response: `==PASS=${pass}`, shouldClose: false };
    }
    if (body === 'PWER=ALL') {
        let resp = '';
        VALID_ROOMS.forEach(r => {
            const statusStr = rooms[r].status === 1 ? 'on 21/07/26 13:37:46 - 22/07/26 01:00:00' : 'off';
            resp += `==PWER${r}=${statusStr}\r\n`;
        });
        for (let i = 0; i < 10; i++) {
            resp += `==PWER=off\r\n`;
        }
        resp += `==ACKW`;
        return { response: resp, shouldClose: false };
    }
    if (body === 'RDSS=ALL') {
        let resp = '';
        for (let i = 1001; i <= 1008; i++) {
            resp += `==RDSS${i}=0\r\n`;
        }
        for (let i = 1017; i <= 1024; i++) {
            resp += `==RDSS${i}=0\r\n`;
        }
        resp += `==ACKW`;
        return { response: resp, shouldClose: false };
    }
    if (body === 'EXTA=ALL') {
        return { response: '==EXTA=ALL', shouldClose: false };
    }
    if (body === 'EXTC=ALL') {
        return { response: '==EXTC=ALL', shouldClose: false };
    }
    if (body === 'EVNT=END') {
        return { response: '==EVNT=END', shouldClose: false };
    }
    if (body === 'EVNT=ALL') {
        return { response: '==EVNT=ALL', shouldClose: false };
    }
    if (body === 'SMDXpend=') {
        return { response: '==SMDXpend=0', shouldClose: false };
    }
    if (body === 'DATE=') {
        const now = new Date();
        const yy = String(now.getFullYear()).substring(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const w = now.getDay() || 7; // Sunday = 7
        return { response: `==DATE=${yy}/${mm}/${dd}-${w}`, shouldClose: false };
    }
    if (body === 'TIME=') {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return { response: `==TIME=${hh}:${mm}:${ss}`, shouldClose: false };
    }

    // ── STOP command ──
    if (body === 'STOP') {
        return { response: '==STOP', shouldClose: true };
    }

    // 1. Power Control (PWER)
    // ..PWER{room}=1 (ON), ..PWER{room}=0 (OFF)
    const pwerMatch = body.match(/^PWER(\d{3,4})=(\d?)$/);
    if (pwerMatch) {
        const roomNum = normalizeRoomNum(pwerMatch[1]);
        const value = pwerMatch[2];

        // Validate room exists
        if (!rooms[roomNum]) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        // Check fault injection: nack-room
        if (CONFIG.nackRoom === roomNum) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (value === '') {
            // READ: individual status query is NOT supported on the real PBX (returns NACK)
            stats.totalNacks++;
            return { response: `==NACK=>PWER${pwerMatch[1]}=`, shouldClose: false };
        } else {
            // SET: update status (0=OFF, 1 = ON)
            const statusVal = parseInt(value, 10);
            if (statusVal < 0) {
                stats.totalNacks++;
                return { response: '==NACK', shouldClose: false };
            }
            if (statusVal === 0) {
                rooms[roomNum].status = 0;
                return {
                    response: `==PWER${roomNum}=off`,
                    shouldClose: false,
                };
            } else {
                rooms[roomNum].status = 1;
                return {
                    response: `==PWER${roomNum}=on 21/07/26 13:37:46 - 22/07/26 01:00:00`,
                    shouldClose: false,
                };
            }
        }
    }

    // ── ROOM command (Guest Name on Extension) ──
    // Patterns: ROOMext=name (set) or ROOMext= (read)
    const nameMatch = body.match(/^ROOM(\d{3,4})=(.*)$/);
    if (nameMatch) {
        const ext = nameMatch[1];
        // Map extension (1017-1022) back to room number (101-106)
        let roomNum = normalizeRoomNum(ext);
        const extNum = parseInt(ext, 10);
        if (extNum >= 1017 && extNum <= 1022) {
            roomNum = String(extNum - 916); // 1017 -> 101
        }
        const name = nameMatch[2];

        if (!rooms[roomNum]) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (CONFIG.nackRoom === roomNum) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (name === '') {
            // READ: return current guest name (defaults to '0' if empty like real PBX)
            const guestName = rooms[roomNum].name || '0';
            return {
                response: `==ROOM${ext}=${guestName}`,
                shouldClose: false,
            };
        } else {
            // SET: truncate to 16 characters (Phonik limit)
            rooms[roomNum].name = name.trim().substring(0, 16);
            return {
                response: `==ROOM${ext}=${rooms[roomNum].name}`,
                shouldClose: false,
            };
        }
    }

    // ── WAKE command ──
    // Patterns: WAKEnnn=hhmm (set) or WAKEnnn=0 (cancel) or WAKEnnn= (read)
    const wakeMatch = body.match(/^WAKE(\d{3,4})=(.*)$/);
    if (wakeMatch) {
        const ext = wakeMatch[1];
        let roomNum = normalizeRoomNum(ext);
        const extNum = parseInt(ext, 10);
        if (extNum >= 1017 && extNum <= 1022) {
            roomNum = String(extNum - 916);
        }
        const value   = wakeMatch[2];

        if (!rooms[roomNum]) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (CONFIG.nackRoom === roomNum) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (value === '') {
            // READ: return current wakeup setting
            return {
                response: `==WAKE${ext}=${rooms[roomNum].wake}`,
                shouldClose: false,
            };
        } else if (value === '0') {
            // CANCEL wakeup
            rooms[roomNum].wake = '0';
            return {
                response: `==WAKE${ext}=0`,
                shouldClose: false,
            };
        } else {
            // SET wakeup — validate hhmm format
            if (/^\d{4}$/.test(value)) {
                const hh = parseInt(value.substring(0, 2), 10);
                const mm = parseInt(value.substring(2, 4), 10);
                if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
                    rooms[roomNum].wake = value;
                    return {
                        response: `==WAKE${ext}=${value}`,
                        shouldClose: false,
                    };
                }
            }
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }
    }

    // ── LOCK command ──
    // Pattern: LOCKnnn=k
    const lockMatch = body.match(/^LOCK(\d{3,4})=(\d?)$/);
    if (lockMatch) {
        const ext = lockMatch[1];
        let roomNum = normalizeRoomNum(ext);
        const extNum = parseInt(ext, 10);
        if (extNum >= 1017 && extNum <= 1022) {
            roomNum = String(extNum - 916);
        }
        const value   = lockMatch[2];

        if (!rooms[roomNum]) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (CONFIG.nackRoom === roomNum) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (value === '') {
            // READ
            return {
                response: `==LOCK${ext}=${rooms[roomNum].lock}`,
                shouldClose: false,
            };
        } else {
            const lockVal = parseInt(value, 10);
            if (lockVal === 0 || lockVal === 1) {
                rooms[roomNum].lock = lockVal;
                return {
                    response: `==LOCK${ext}=${lockVal}`,
                    shouldClose: false,
                };
            }
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }
    }

    // ── LANG command ──
    // Pattern: LANGnnn=i
    const langMatch = body.match(/^LANG(\d{3,4})=(\d?)$/);
    if (langMatch) {
        const roomNum = normalizeRoomNum(langMatch[1]);
        const value   = langMatch[2];

        if (!rooms[roomNum]) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (CONFIG.nackRoom === roomNum) {
            stats.totalNacks++;
            return { response: '==NACK', shouldClose: false };
        }

        if (value === '') {
            // READ
            return {
                response: `==LANG${roomNum}=${rooms[roomNum].lang}`,
                shouldClose: false,
            };
        } else {
            const langVal = parseInt(value, 10);
            rooms[roomNum].lang = langVal;
            return {
                response: `==LANG${roomNum}=${langVal}`,
                shouldClose: false,
            };
        }
    }

    // ── Unknown / Malformed command ──
    stats.totalNacks++;
    return { response: '==NACK', shouldClose: false };
}

// ============================================================================
// LIVE TERMINAL DASHBOARD — Beautiful ANSI rendering with box-drawing chars
// ============================================================================

/**
 * Get the status color ANSI code for a given room status.
 * @param {number} status - Room status code
 * @returns {string} ANSI color code
 */
function statusColor(status) {
    switch (status) {
        case 0: return ANSI.RED;            // OFF → Red
        case 1: return ANSI.BRIGHT_GREEN;   // ON → Green
        case 2: return ANSI.YELLOW;         // Maintenance → Yellow
        case 3: return ANSI.BRIGHT_MAGENTA; // OOO → Magenta
        default: return ANSI.WHITE;
    }
}

/**
 * Get a status icon for visual appeal.
 * @param {number} status
 * @returns {string}
 */
function statusIcon(status) {
    switch (status) {
        case 0: return '○'; // OFF
        case 1: return '●'; // ON
        case 2: return '◐'; // Maintenance
        case 3: return '✕'; // OOO
        default: return '?';
    }
}

/**
 * Pad or truncate a string to exactly `len` characters.
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function pad(str, len) {
    const s = String(str);
    if (s.length >= len) return s.substring(0, len);
    return s + ' '.repeat(len - s.length);
}

/**
 * Center-align a string within a given width.
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function center(str, width) {
    const s = String(str);
    if (s.length >= width) return s.substring(0, width);
    const leftPad = Math.floor((width - s.length) / 2);
    const rightPad = width - s.length - leftPad;
    return ' '.repeat(leftPad) + s + ' '.repeat(rightPad);
}

/**
 * Calculate server uptime as a human-readable string.
 * @returns {string}
 */
function uptime() {
    const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
    const hours   = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Render the complete terminal dashboard.
 * Uses box-drawing characters (Unicode) and ANSI colors for a professional look.
 */
function renderDashboard() {
    const R = ANSI.RESET;
    const B = ANSI.BOLD;
    const D = ANSI.DIM;
    const C = ANSI.CYAN;
    const W = ANSI.BRIGHT_WHITE;
    const Y = ANSI.YELLOW;
    const G = ANSI.GREEN;
    const M = ANSI.MAGENTA;
    const BG = ANSI.BG_BRIGHT_BLACK;

    const lines = [];

    // ── Header ──
    lines.push(`${ANSI.CLEAR}${ANSI.HOME}`);
    lines.push(`${B}${C}  ╔══════════════════════════════════════════════════════════════════════╗${R}`);
    lines.push(`${B}${C}  ║${R}${B}${W}    ☎  PHONIK PBX ECS-103R V.5 — TCP SIMULATOR (DIGITAL TWIN)    ${R}${B}${C}║${R}`);
    lines.push(`${B}${C}  ║${R}${D}        Hotel Smart Check-in System • Port ${CONFIG.port}                    ${R}${B}${C}║${R}`);
    lines.push(`${B}${C}  ╚══════════════════════════════════════════════════════════════════════╝${R}`);
    lines.push('');

    // ── Status Bar ──
    const connCount = activeConnections.size;
    const connColor = connCount > 0 ? ANSI.BRIGHT_GREEN : ANSI.BRIGHT_RED;

    lines.push(`${D}  ┌─ SERVER STATUS ───────────────────────────────────────────────────┐${R}`);
    lines.push(`${D}  │${R}  ⏱  Uptime: ${B}${W}${uptime()}${R}   │   📡 Connections: ${connColor}${B}${connCount}${R}   │   📊 Commands: ${B}${W}${stats.totalCommands}${R}   ${D}│${R}`);

    // Show fault injection status if any are active
    const faults = [];
    if (CONFIG.delay > 0)       faults.push(`${Y}⏳ Delay: ${CONFIG.delay}ms${R}`);
    if (CONFIG.dropRate > 0)    faults.push(`${ANSI.RED}📉 Drop: ${(CONFIG.dropRate * 100).toFixed(0)}%${R}`);
    if (CONFIG.nackRoom)        faults.push(`${ANSI.RED}🚫 NACK Room: ${CONFIG.nackRoom}${R}`);

    if (faults.length > 0) {
        lines.push(`${D}  │${R}  ⚠️  Fault Injection: ${faults.join('  ')}   ${D}│${R}`);
    }

    lines.push(`${D}  └──────────────────────────────────────────────────────────────────┘${R}`);
    lines.push('');

    // ── Room State Table ──
    lines.push(`${B}${W}  ┌─ ROOM STATE ──────────────────────────────────────────────────────┐${R}`);
    lines.push(`${B}${W}  │ ${pad('Room', 6)}│ ${pad('Status', 13)}│ ${pad('Guest Name', 18)}│ ${pad('Wake', 6)}│ ${pad('Lock', 6)}│ ${pad('Lang', 5)}│${R}`);
    lines.push(`${W}  ├──────┼─────────────┼──────────────────┼──────┼──────┼─────┤${R}`);

    for (const roomNum of VALID_ROOMS) {
        const room = rooms[roomNum];
        const sColor = statusColor(room.status);
        const sIcon  = statusIcon(room.status);
        const sLabel = STATUS_LABELS[room.status] || '???';
        const guestDisplay = room.name || `${D}(vacant)${R}`;
        const wakeDisplay  = room.wake || `${D}--:--${R}`;
        const lockDisplay  = room.lock ? `${ANSI.RED}🔒${R}` : `${G}🔓${R}`;
        const isNackRoom   = CONFIG.nackRoom === roomNum;
        const roomLabel    = isNackRoom
            ? `${ANSI.RED}${B}${roomNum}${R}${ANSI.RED}⚠${R}`
            : `${B}${W}${roomNum}${R} `;

        lines.push(
            `  │ ${pad('', 0)}${roomLabel}${pad('', 6 - roomNum.length - 1)}` +
            `│ ${sColor}${B}${sIcon} ${pad(sLabel, 10)}${R}` +
            `│ ${pad(room.name || '(vacant)', 17)}` +
            `│ ${pad(room.wake || '--:--', 5)}` +
            `│ ${room.lock ? ` ${ANSI.RED}LOCK${R} ` : ` ${G}OPEN${R} `}` +
            `│ ${pad(String(room.lang), 4)}│`
        );
    }

    lines.push(`${W}  └──────┴─────────────┴──────────────────┴──────┴──────┴─────┘${R}`);
    lines.push('');

    // ── Command Log ──
    lines.push(`${B}${M}  ┌─ COMMAND LOG (last ${MAX_LOG_ENTRIES}) ──────────────────────────────────────────┐${R}`);

    if (commandLog.length === 0) {
        lines.push(`${D}  │  (waiting for commands...)                                       │${R}`);
    } else {
        for (const entry of commandLog) {
            const cmdDisplay = pad(entry.command, 22);
            const resDisplay = pad(entry.response, 22);
            const isNack     = entry.response.includes('NACK');
            const isDrop     = entry.response.includes('[DROPPED]');
            const resColor   = isNack ? ANSI.RED : (isDrop ? ANSI.YELLOW : ANSI.GREEN);

            lines.push(
                `${D}  │${R} ${D}${entry.time}${R} ` +
                `${ANSI.BRIGHT_CYAN}${pad(entry.client, 16)}${R} ` +
                `${W}${cmdDisplay}${R} → ${resColor}${resDisplay}${R} ${D}│${R}`
            );
        }
    }

    lines.push(`${M}  └──────────────────────────────────────────────────────────────────┘${R}`);
    lines.push('');

    // ── Footer ──
    lines.push(`${D}  Press ${B}Ctrl+C${R}${D} to gracefully shut down the simulator.${R}`);
    lines.push('');

    // Write to stdout in a single operation for flicker-free rendering
    process.stdout.write(lines.join('\n'));
}

// ============================================================================
// TCP SERVER — Handles multiple concurrent client connections
// ============================================================================

const server = net.createServer((socket) => {
    // ── Connection Setup ──
    const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    activeConnections.add(socket);
    stats.totalConnections++;

    // Immediately write the Phonik PABX Telnet system greeting & prompt if running on standard Telnet port 23
    if (CONFIG.port === 23) {
        socket.write('Phonik PABX Telnet system\r\n..');
    }

    // Buffer for accumulating incoming data (Buffer handles binary and ASCII cleanly)
    let dataBuffer = Buffer.alloc(0);

    // Refresh dashboard to show new connection
    renderDashboard();

    // ── Data Handler ──
    socket.on('data', (chunk) => {
        dataBuffer = Buffer.concat([dataBuffer, chunk]);

        let proc = true;
        while (proc) {
            proc = false;

            // 1. Process Phonik Binary Keep-Alive / SMDR packets (start with 'Z' / 0x5a)
            if (dataBuffer.length > 0 && dataBuffer[0] === 0x5a) {
                if (dataBuffer.length >= 2) {
                    const len = dataBuffer[1];
                    const packetLen = 1 + len;
                    if (dataBuffer.length >= packetLen) {
                        const binPkt = dataBuffer.subarray(0, packetLen);
                        dataBuffer = dataBuffer.subarray(packetLen);
                        
                        // Log the binary packet to the dashboard
                        logCommand(clientAddr, `[BIN] ${binPkt.toString('hex')}`, '[OK/IGNORED]');
                        proc = true;
                        continue;
                    }
                }
            }

            // 2. Process ASCII commands terminated by \n (0x0a)
            const idx = dataBuffer.indexOf(0x0a);
            if (idx !== -1) {
                const line = dataBuffer.subarray(0, idx).toString('ascii').replace(/\r$/, '').trim();
                dataBuffer = dataBuffer.subarray(idx + 1);

                if (line.length === 0) {
                    proc = true;
                    continue;
                }

                // Process the command
                handleCommand(socket, clientAddr, line);
                proc = true;
            }
        }
    });

    // ── Connection Close ──
    socket.on('close', () => {
        activeConnections.delete(socket);
        renderDashboard();
    });

    // ── Error Handler ──
    socket.on('error', (err) => {
        // ECONNRESET is normal when clients disconnect abruptly
        if (err.code !== 'ECONNRESET') {
            logCommand(clientAddr, `[SOCKET ERROR]`, err.message);
        }
        activeConnections.delete(socket);
    });

    // ── Timeout: 5 minutes of inactivity ──
    socket.setTimeout(300000);
    socket.on('timeout', () => {
        logCommand(clientAddr, '[TIMEOUT]', 'Connection timed out after 5min');
        socket.destroy();
    });
});

/**
 * Handle a single parsed command line from a client.
 * Applies fault injection (delay, drop-rate, nack-room) before responding.
 *
 * @param {net.Socket} socket    - Client socket
 * @param {string}     clientAddr - Client IP:port for logging
 * @param {string}     rawLine    - Raw command line (without \r\n)
 */
function handleCommand(socket, clientAddr, rawLine) {
    const { response, shouldClose } = processCommand(rawLine);

    /**
     * Inner function to actually send the response.
     * Separated to allow wrapping with delay logic.
     */
    const sendResponse = () => {
        // ── Fault Injection: Drop Rate ──
        if (CONFIG.dropRate > 0 && Math.random() < CONFIG.dropRate) {
            stats.totalDropped++;
            logCommand(clientAddr, rawLine, '[DROPPED]');
            return; // Silently drop — no response sent
        }

        // Send the response with \r\n terminator
        const fullResponse = response + '\r\n';

        if (!socket.destroyed) {
            socket.write(fullResponse, 'ascii');
        }

        logCommand(clientAddr, rawLine, response);

        // If STOP command, close the connection after sending response
        if (shouldClose) {
            socket.end();
        }
    };

    // ── Fault Injection: Artificial Delay ──
    if (CONFIG.delay > 0) {
        setTimeout(sendResponse, CONFIG.delay);
    } else {
        sendResponse();
    }
}

// ============================================================================
// SERVER ERROR HANDLING
// ============================================================================

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n${ANSI.RED}${ANSI.BOLD}  [FATAL] Port ${CONFIG.port} is already in use!${ANSI.RESET}`);
        console.error(`  Try a different port: node pbx-simulator.js --port 10002\n`);
        process.exit(1);
    } else {
        console.error(`\n${ANSI.RED}  [SERVER ERROR] ${err.message}${ANSI.RESET}\n`);
    }
});

// ============================================================================
// GRACEFUL SHUTDOWN — Clean up on SIGINT (Ctrl+C)
// ============================================================================

/**
 * Perform graceful shutdown:
 * 1. Show cursor again
 * 2. Close all client connections
 * 3. Stop accepting new connections
 * 4. Exit process
 */
function gracefulShutdown() {
    // Restore cursor visibility
    process.stdout.write(ANSI.SHOW_CURSOR);

    console.log(`\n${ANSI.YELLOW}${ANSI.BOLD}`);
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log('  │   🛑  Shutting down PBX Simulator...        │');
    console.log('  └─────────────────────────────────────────────┘');
    console.log(ANSI.RESET);

    // Close all active client connections gracefully
    for (const socket of activeConnections) {
        socket.end('==STOP\r\n');
        socket.destroy();
    }
    activeConnections.clear();

    // Stop the TCP server from accepting new connections
    server.close(() => {
        console.log(`${ANSI.GREEN}  ✓ Server closed. Total sessions: ${stats.totalConnections} | Total commands: ${stats.totalCommands}${ANSI.RESET}`);
        console.log(`${ANSI.DIM}  Goodbye! 👋${ANSI.RESET}\n`);
        process.exit(0);
    });

    // Force exit after 3 seconds if graceful close hangs
    setTimeout(() => {
        console.error(`${ANSI.RED}  [WARN] Forced exit after timeout.${ANSI.RESET}`);
        process.exit(1);
    }, 3000);
}

// Register shutdown handlers
process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Ensure cursor is shown if process crashes
process.on('uncaughtException', (err) => {
    process.stdout.write(ANSI.SHOW_CURSOR);
    console.error(`\n${ANSI.RED}  [UNCAUGHT EXCEPTION] ${err.message}${ANSI.RESET}`);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    process.stdout.write(ANSI.SHOW_CURSOR);
    console.error(`\n${ANSI.RED}  [UNHANDLED REJECTION] ${reason}${ANSI.RESET}`);
    process.exit(1);
});

// ============================================================================
// START THE SERVER
// ============================================================================

if (require.main === module) {
    server.listen(CONFIG.port, '0.0.0.0', () => {
        // Hide cursor for clean dashboard rendering
        process.stdout.write(ANSI.HIDE_CURSOR);

        // Initial dashboard render
        renderDashboard();
    });
}

// ============================================================================
// MODULE EXPORTS — Allow programmatic use in tests or other scripts
// ============================================================================

module.exports = {
    server,
    rooms,
    processCommand,
    CONFIG,
    VALID_ROOMS,
};
