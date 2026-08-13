'use strict';

/**
 * @file probe-pbx.js — สคริปต์ทดสอบการเชื่อมต่อ TCP กับตู้ Phonik PBX
 *
 * ทำงาน 3 ขั้นตอน:
 *   1. TCP Connect — ทดสอบว่าเปิด socket ได้ไหม
 *   2. VERS Query  — ส่งคำสั่งอ่าน firmware version (ปลอดภัย 100%, ไม่กระทบรีเลย์)
 *   3. ROOM Query  — ลองอ่านสถานะห้องทดสอบ (ปลอดภัย, read-only)
 *
 * การใช้งาน:
 *   node probe-pbx.js [host] [port] [room]
 *
 * ตัวอย่าง:
 *   node probe-pbx.js 192.168.1.91 23 101
 *   node probe-pbx.js                          ← ใช้ค่า default (192.168.1.91:23, room 101)
 *
 * @author RelaySync Integration Team
 */

const net = require('net');
const { buildGetVersion, buildGetRoom, parseResponse, TERMINATOR } = require('./protocol');

// ─── Configuration ────────────────────────────────────────────────────────────
const HOST = process.argv[2] || '192.168.1.91';
const PORT = parseInt(process.argv[3] || '23', 10);
const TEST_ROOM = process.argv[4] || '101';
const TIMEOUT_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const log = (icon, msg) => console.log(`  ${icon}  ${msg}`);
const separator = () => console.log('─'.repeat(60));

/**
 * ส่งคำสั่งผ่าน TCP socket และรอ response
 * @param {net.Socket} socket
 * @param {string} command
 * @returns {Promise<string>}
 */
function sendCommand(socket, command) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => {
            reject(new Error(`Timeout: ตู้ PBX ไม่ตอบกลับภายใน ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);

        const onData = (chunk) => {
            buffer += chunk.toString('ascii');
            const idx = buffer.indexOf(TERMINATOR);
            if (idx !== -1) {
                clearTimeout(timer);
                socket.removeListener('data', onData);
                resolve(buffer.substring(0, idx + TERMINATOR.length));
            }
        };

        socket.on('data', onData);
        socket.write(command, 'ascii');
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║    🔍 RelaySync — PBX Connection Probe                 ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    log('🎯', `เป้าหมาย: ${HOST}:${PORT}`);
    log('🏨', `ห้องทดสอบ: ${TEST_ROOM}`);
    separator();

    // ── Step 1: TCP Connect ──
    log('⏳', 'ขั้นตอนที่ 1/3 — ทดสอบ TCP Connection...');

    const socket = new net.Socket();

    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`Timeout: ไม่สามารถเชื่อมต่อ ${HOST}:${PORT} ภายใน ${TIMEOUT_MS}ms`));
            }, TIMEOUT_MS);

            socket.once('connect', () => {
                clearTimeout(timer);
                resolve();
            });

            socket.once('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });

            socket.connect(PORT, HOST);
        });

        log('✅', `TCP Connected สำเร็จ! (${HOST}:${PORT})`);

    } catch (err) {
        log('❌', `TCP Connection ล้มเหลว!`);
        log('💡', `Error: ${err.message}`);
        separator();
        console.log('\n📋 แนวทางแก้ไข:');
        console.log('   1. ตรวจสอบว่าเครื่อง Windows อยู่ในวง LAN เดียวกับตู้ PBX');
        console.log('   2. ลอง ping IP ของตู้: ping ' + HOST);
        console.log('   3. ตรวจสอบว่า Firewall ไม่ได้บล็อค Port ' + PORT);
        console.log('   4. ตรวจสอบกับช่างว่า IP/Port ถูกต้อง\n');
        process.exit(1);
    }

    separator();

    // ── Step 2: VERS Query (อ่าน Firmware Version) ──
    log('⏳', 'ขั้นตอนที่ 2/3 — ส่งคำสั่ง VERS (อ่าน Firmware Version)...');

    try {
        const versCmd = buildGetVersion();
        log('📤', `ส่ง: ${versCmd.replace(/\r\n/, '\\r\\n')}`);

        const versResp = await sendCommand(socket, versCmd);
        const versParsed = parseResponse(versResp);

        log('📥', `รับ: ${versResp.replace(/\r\n/, '\\r\\n')}`);

        if (versParsed.error) {
            log('⚠️', `PBX ตอบกลับด้วย Error: ${versParsed.errorMessage}`);
        } else {
            log('✅', `Firmware Version: ${versParsed.value}`);
        }

    } catch (err) {
        log('❌', `VERS Query ล้มเหลว: ${err.message}`);
        log('💡', 'ตู้เปิดรับ TCP แต่อาจไม่ตอบกลับตาม Protocol — ตรวจสอบรุ่นตู้อีกครั้ง');
    }

    separator();

    // ── Step 3: ROOM Query (อ่านสถานะห้อง — Read Only) ──
    log('⏳', `ขั้นตอนที่ 3/3 — ส่งคำสั่ง GET ROOM ${TEST_ROOM} (อ่านสถานะห้อง)...`);

    try {
        const roomCmd = buildGetRoom(TEST_ROOM);
        log('📤', `ส่ง: ${roomCmd.replace(/\r\n/, '\\r\\n')}`);

        const roomResp = await sendCommand(socket, roomCmd);
        const roomParsed = parseResponse(roomResp);

        log('📥', `รับ: ${roomResp.replace(/\r\n/, '\\r\\n')}`);

        if (roomParsed.error) {
            log('⚠️', `PBX ตอบกลับด้วย Error: ${roomParsed.errorMessage}`);
        } else {
            const statusMap = { '0': 'OFF (ตัดไฟ)', '1': 'ON (จ่ายไฟ)', '2': 'MAINTENANCE', '3': 'OUT_OF_ORDER' };
            const statusLabel = statusMap[roomParsed.value] || `UNKNOWN (${roomParsed.value})`;
            log('✅', `ห้อง ${TEST_ROOM} สถานะ: ${statusLabel}`);
        }

    } catch (err) {
        log('❌', `ROOM Query ล้มเหลว: ${err.message}`);
    }

    // ── Cleanup ──
    socket.destroy();

    separator();
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║    📋 สรุปผลการทดสอบ                                    ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║  ถ้าทั้ง 3 ขั้นตอน ✅ สำเร็จ → พร้อมยิงคำสั่งจริงแล้ว!  ║');
    console.log('║                                                        ║');
    console.log('║  ขั้นตอนถัดไป:                                          ║');
    console.log(`║  node test-relay.js ${HOST} ${PORT} ${TEST_ROOM} on`.padEnd(57) + '║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
    console.error('\n❌ Unexpected Error:', err.message);
    process.exit(1);
});
