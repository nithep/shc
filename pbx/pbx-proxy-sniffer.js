/**
 * pbx-proxy-sniffer.js
 * 
 * โปรแกรมดักจับ (Proxy Sniffer) Traffic ระหว่าง Phonik PC Operator กับตู้ PBX
 * วิธีใช้: เปิดโปรแกรมนี้แล้วให้ PC Operator เชื่อมต่อมาที่ 127.0.0.1 port 23
 * โปรแกรมจะแสดงและบันทึกทุก byte ที่ส่งไป-มาพร้อม Hex dump ละเอียดทุก frame
 * 
 * ผลลัพธ์บันทึกใน: capture_<timestamp>.log
 */

'use strict';

const net = require('net');
const fs  = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const LISTEN_PORT = 23;           // port ที่ PC Operator จะเชื่อมต่อมา
const PBX_HOST    = '192.168.1.91';
const PBX_PORT    = 23;

// ─── Log File ────────────────────────────────────────────────────────────────
const timestamp   = new Date().toISOString().replace(/[:.]/g, '-');
const logFile     = path.join(__dirname, `capture_${timestamp}.log`);
const logStream   = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    logStream.write(line + '\n');
}

function hexDump(label, buf) {
    const hex = buf.toString('hex').replace(/(.{2})/g, '$1 ').trim();
    const ascii = buf.toString('ascii').replace(/[^\x20-\x7e]/g, '.');
    log(`[${label}] HEX: ${hex}`);
    log(`[${label}] STR: ${ascii}`);
    log(`[${label}] RAW: ${JSON.stringify(buf.toString('ascii'))}`);
    log('');
}

// ─── Proxy Server ─────────────────────────────────────────────────────────────
const server = net.createServer((clientSocket) => {
    const cid = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    log(`\n${'='.repeat(60)}`);
    log(`=== NEW CONNECTION from ${cid} ===`);
    log(`${'='.repeat(60)}\n`);

    // เชื่อมต่อไปยัง PBX จริง
    const pbxSocket = new net.Socket();
    pbxSocket.connect(PBX_PORT, PBX_HOST, () => {
        log(`=== Connected to PBX ${PBX_HOST}:${PBX_PORT} ===\n`);
    });

    // ─── PC Operator → PBX ──────────────────────────────────────────────────
    clientSocket.on('data', (data) => {
        log(`>>> [PC Operator → PBX] (${data.length} bytes)`);
        hexDump('PC→PBX', data);
        pbxSocket.write(data);
    });

    // ─── PBX → PC Operator ──────────────────────────────────────────────────
    pbxSocket.on('data', (data) => {
        log(`<<< [PBX → PC Operator] (${data.length} bytes)`);
        hexDump('PBX→PC', data);
        clientSocket.write(data);
    });

    // ─── Cleanup ─────────────────────────────────────────────────────────────
    clientSocket.on('close', () => {
        log(`=== PC Operator Disconnected (${cid}) ===\n`);
        pbxSocket.destroy();
    });
    pbxSocket.on('close', () => {
        log(`=== PBX Disconnected ===\n`);
        clientSocket.destroy();
    });

    clientSocket.on('error', (err) => log(`[ERROR] Client: ${err.message}`));
    pbxSocket.on('error',    (err) => log(`[ERROR] PBX:    ${err.message}`));
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${LISTEN_PORT} ถูกใช้งานอยู่แล้วครับ`);
        console.error(`   หยุดโปรแกรมอื่นที่ใช้ Port 23 ก่อน (รวมถึง node proxy.js เก่า) แล้วลองใหม่\n`);
        process.exit(1);
    }
    throw err;
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
    console.log('\n' + '═'.repeat(62));
    console.log('  🕵️  PHONIK PBX PROXY SNIFFER — พร้อมดักจับคำสั่ง');
    console.log('═'.repeat(62));
    console.log(`  ✅ รอรับการเชื่อมต่อที่  127.0.0.1 : ${LISTEN_PORT}`);
    console.log(`  🎯 ส่งต่อทุก request ไปที่ ${PBX_HOST}:${PBX_PORT}`);
    console.log(`  📄 บันทึก Log ไว้ที่: ${logFile}`);
    console.log('═'.repeat(62));
    console.log('\n📋 ขั้นตอนการใช้งาน:');
    console.log('  1. ปิดการเชื่อมต่อใน Phonik PC Operator ก่อน');
    console.log('  2. เปลี่ยน IP ใน PC Operator จาก 192.168.1.91 → 127.0.0.1');
    console.log('  3. กด Connect ใน PC Operator');
    console.log('  4. กดเปิด/ปิดไฟห้อง 101 หรือ 104 ดู');
    console.log('  5. สังเกตคำสั่งที่ปรากฏใน Log นี้เลยครับ!\n');
});

process.on('SIGINT', () => {
    log('\n=== Sniffer stopped by user ===');
    logStream.end();
    server.close();
    process.exit(0);
});
