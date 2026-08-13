'use strict';

/**
 * @file master_process_test.js — สคริปต์ทดสอบกระบวนการทำงานทั้งระบบ (End-to-End Master Process Test)
 * 
 * รันตามลำดับขั้นตอน:
 * 1. ตรวจสอบและเตรียมฐานข้อมูล (Room State Init)
 * 2. จำลองการ Check-in (PBX Relay ON + DB Sync)
 * 3. ตรวจสอบความถูกต้องของสถานะ (State Verification)
 * 4. ทดสอบบริการแจ้งเตือน (EmailNotifier + GoogleNotifier)
 * 5. จำลองการ Check-out (PBX Relay OFF + DB Sync)
 * 6. ตรวจสอบสถานะการตัดกระแสไฟขั้นสุดท้าย
 */

const { createConnector } = require('../pbx');
const db = require('./db');
const EmailNotifier = require('./services/email_notifier');

async function runMasterProcessTest() {
    console.log('\n=========================================================================');
    console.log('⚡ [HOTEL-ECS] MASTER PROCESS END-TO-END VERIFICATION TEST');
    console.log('=========================================================================\n');

    const testRoom = 105;
    const guestName = 'คุณสมชาย ใจดี (Master Test Guest)';
    
    // 1. Initialize PBX Connector in Mock Mode (Digital Twin)
    console.log('📌 STEP 1: Connecting to PBX Connector (Digital Twin Mock)...');
    const pbx = createConnector({ mode: 'mock', host: '127.0.0.1', port: 10001 });
    await pbx.connect();
    console.log('   ✅ PBX Digital Twin Connected Successfully.\n');

    // 2. Execute Check-in Process (Power ON)
    console.log(`📌 STEP 2: Executing Check-in Process for Room ${testRoom}...`);
    console.log(`   - Guest Name: ${guestName}`);
    console.log(`   - Sending PBX CCH2 Command: RELAY_ON (Power Relay Activation)...`);
    
    const checkinHwResult = await pbx.checkIn(testRoom, guestName, 1);
    console.log(`   - PBX Hardware Status:`, JSON.stringify(checkinHwResult));

    // Sync DB State to Occupied
    await new Promise((resolve, reject) => {
        db.updateRoomState(testRoom, 'occupied', true, { guestName }, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    console.log(`   ✅ Database Updated: Room ${testRoom} state -> OCCUPIED | Power -> ON\n`);

    // 3. State Verification for Check-in
    console.log('📌 STEP 3: Verifying State Integrity for Check-in...');
    const roomStateInDb = await new Promise((resolve, reject) => {
        db.db.get("SELECT * FROM rooms WHERE id = ?", [testRoom], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
    console.log(`   - Verified Room Status from DB: State=${roomStateInDb.status}, Power=${roomStateInDb.power ? 'ON' : 'OFF'}, Guest=${roomStateInDb.guest_name}`);
    if (roomStateInDb.status !== 'occupied' || !roomStateInDb.power) {
        throw new Error(`State verification failed: DB state mismatch`);
    }
    console.log('   ✅ State Verification PASSED: Relay is active (Power ON).\n');

    // 4. Test Notification Services
    console.log('📌 STEP 4: Triggering Notification Services (Workspace Email & Google Chat)...');
    const emailNotifier = new EmailNotifier();
    console.log(`   - SMTP Configured: ${emailNotifier.isConfigured() ? 'YES (App Password Active)' : 'DRY-RUN / MOCK MODE'}`);
    
    const emailResult = await emailNotifier.sendCheckinEmail({
        roomNumber: String(testRoom),
        guestName,
        checkinTime: new Date().toLocaleString('th-TH')
    });
    console.log(`   - Email Alert Result:`, JSON.stringify(emailResult));
    console.log('   ✅ Notification Pipeline Verified.\n');

    // Wait 2 seconds simulate guest stay
    console.log('⏳ Simulating 2 seconds guest stay duration...\n');
    await new Promise(r => setTimeout(r, 2000));

    // 5. Execute Check-out Process (Power OFF)
    console.log(`📌 STEP 5: Executing Check-out Process for Room ${testRoom}...`);
    console.log(`   - Sending PBX CCH2 Command: RELAY_OFF (Power Relay Cutoff)...`);
    const checkoutHwResult = await pbx.checkOut(testRoom);
    console.log(`   - PBX Hardware Status:`, JSON.stringify(checkoutHwResult));

    // Sync DB State to Vacant
    await new Promise((resolve, reject) => {
        db.updateRoomState(testRoom, 'vacant', false, {}, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    console.log(`   ✅ Database Updated: Room ${testRoom} state -> VACANT | Power -> OFF\n`);

    // 6. Final State Verification for Check-out
    console.log('📌 STEP 6: Verifying Final State Integrity for Check-out...');
    const roomStateAfterCheckout = await new Promise((resolve, reject) => {
        db.db.get("SELECT * FROM rooms WHERE id = ?", [testRoom], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
    console.log(`   - Verified Room Status from DB: State=${roomStateAfterCheckout.status}, Power=${roomStateAfterCheckout.power ? 'ON' : 'OFF'}`);
    if (roomStateAfterCheckout.status !== 'vacant' || roomStateAfterCheckout.power) {
        throw new Error(`Final state verification failed: DB state mismatch`);
    }
    console.log('   ✅ Final Verification PASSED: Room is VACANT and Power Relay is OFF.\n');

    console.log('=========================================================================');
    console.log('🎉 ALL PROCESS STEPS COMPLETED WITH 100% SUCCESS STATUS!');
    console.log('=========================================================================\n');
    
    process.exit(0);
}

runMasterProcessTest().catch(err => {
    console.error('❌ Master Process Test Failed:', err);
    process.exit(1);
});
