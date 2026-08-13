'use strict';

/**
 * @file pi-serial-probe.js — สคริปต์ทดสอบการเชื่อมต่อ Serial (RS-232) กับตู้ Phonik PBX บน Raspberry Pi 4
 *
 * ทำงาน:
 *   1. Serial Connect — ทดสอบว่าเปิด COM Port (หรือ /dev/ttyUSB*) ได้ไหม
 *   2. VERS Query  — ส่งคำสั่งอ่าน firmware version (Ping/Heartbeat) เพื่อเช็คสถานะตู้
 *   3. Disconnect  — ตัดการเชื่อมต่ออย่างสง่างามด้วยคำสั่ง STOP
 *
 * การใช้งาน:
 *   node pi-serial-probe.js [port_name]
 *
 * ตัวอย่าง (Windows):
 *   node pi-serial-probe.js COM3
 * ตัวอย่าง (Pi4 / Linux):
 *   node pi-serial-probe.js /dev/ttyUSB0
 *
 * @author Hotel ECS Integration Team
 */

const { SerialTransport } = require('./transport/serial');
const { buildGetVersion, buildStop, parseResponse } = require('./protocol');

const PORT_NAME = process.argv[2] || (process.platform === 'win32' ? 'COM3' : '/dev/ttyUSB0');
const BAUD_RATE = 9600;

const log = (icon, msg) => console.log(`  ${icon}  ${msg}`);
const separator = () => console.log('─'.repeat(60));

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║    🔍 RelaySync — Pi4 Serial Connection Probe          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    log('🎯', `เป้าหมาย: Serial Port ${PORT_NAME} @ ${BAUD_RATE} bps`);
    separator();

    const serial = new SerialTransport();

    // ── Step 1: Connect ──
    log('⏳', 'ขั้นตอนที่ 1/2 — ทดสอบเปิด Serial Port...');
    try {
        await serial.connect(PORT_NAME, BAUD_RATE);
        log('✅', `เปิดพอร์ต ${PORT_NAME} สำเร็จ!`);
    } catch (err) {
        log('❌', `การเชื่อมต่อพอร์ตล้มเหลว!`);
        log('💡', `Error: ${err.message}`);
        separator();
        console.log('\n📋 แนวทางแก้ไขบน Raspberry Pi 4:');
        console.log('   1. เสียบสาย RS-232 to USB');
        console.log('   2. พิมพ์คำสั่ง: ls /dev/ttyUSB* เพื่อดูชื่อพอร์ตที่แท้จริง');
        console.log('   3. เพิ่มสิทธิ์ (Permissions) โดยใช้: sudo usermod -a -G dialout $USER');
        console.log('   4. ลองรัน: node pi-serial-probe.js /dev/ttyUSB0\n');
        process.exit(1);
    }
    separator();

    // ── Step 2: VERS Query (Ping) ──
    log('⏳', 'ขั้นตอนที่ 2/2 — ส่งคำสั่ง Ping (VERS) ตรวจสอบสถานะตู้...');
    try {
        const versCmd = buildGetVersion();
        log('📤', `ส่ง: ${versCmd.replace(/\r\n/, '\\r\\n')}`);

        const versResp = await serial.send(versCmd, 5000);
        log('📥', `รับ: ${versResp.replace(/\r\n/, '\\r\\n')}`);

        const versParsed = parseResponse(versResp);

        if (versParsed.error) {
            log('⚠️', `ตู้ตอบกลับแบบ NACK หรือเกิดข้อผิดพลาด: ${versParsed.errorMessage}`);
        } else {
            log('✅', `เชื่อมต่อ PBX สำเร็จ! Firmware: ${versParsed.value}`);
        }
    } catch (err) {
        log('❌', `Ping ล้มเหลว: ${err.message}`);
        log('💡', 'ตรวจสอบว่าสาย RS-232 เสียบแน่น และ Baud Rate ตรงกับที่ตั้งไว้ที่ตู้');
    }

    separator();
    
    // ── Step 3: Stop & Disconnect ──
    log('⏳', 'กำลังตัดการเชื่อมต่ออย่างสง่างาม (STOP)...');
    try {
        const stopCmd = buildStop();
        // Fire and forget (optional wait for response)
        await serial.send(stopCmd, 2000).catch(() => {});
    } catch(e) {}
    
    await serial.disconnect();
    log('✅', 'ปิดพอร์ตและจบการทำงานอย่างสมบูรณ์');
    console.log('');
}

main().catch((err) => {
    console.error('\n❌ Unexpected Error:', err.message);
    process.exit(1);
});
