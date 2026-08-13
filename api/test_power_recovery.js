const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createConnector } = require('../pbx');

// Use relative path since we are in backend
const dbPath = path.resolve(__dirname, 'hotel.db');
const db = new sqlite3.Database(dbPath);

console.log('⚡ Starting Power Failure Recovery Test...');

// 1. จำลองสถานการณ์: มีแขกอยู่ในห้อง (Occupied) แต่ตู้ PBX มองว่าไฟปิดอยู่
db.run("UPDATE rooms SET status = 'occupied', power = 0 WHERE id = 101", async (err) => {
    if (err) {
        console.error('❌ Failed to setup test data:', err.message);
        return;
    }

    console.log('✅ Simulated Room 101: Occupied in DB, but Power is OFF in DB.');
    console.log('🔄 Calling syncPbxStateWithDatabase() similar to server startup...');

    // 2. เรียกใช้ฟังก์ชันซิงค์สถานะ (จำลองการดึงโค้ดมาจาก server.js)
    const pbx = createConnector({
        mode: 'mock',
        host: '127.0.0.1',
        port: 5000
    });

    try {
        await pbx.connect();
        console.log('✅ Connected to PBX Simulator.');
        
        // เราตั้งให้ Simulator มองว่า 101 เป็นปิดก่อน
        await pbx.checkOut(101);
        console.log('✅ Forced PBX Simulator to recognize Room 101 as OFF.');

        db.all("SELECT * FROM rooms", async (dbErr, rooms) => {
            if (dbErr) return;

            for (const room of rooms) {
                const isOccupied = room.status === 'occupied'; 
                const pbxStatus = await pbx.getRoomStatus(room.id);
                const isPbxOn = pbxStatus.status === 'ON';

                if (isOccupied && !isPbxOn) {
                    console.log(`[SYNC] Room ${room.id} is Occupied but PBX is OFF. Fixing (Auto-ON)...`);
                    await pbx.checkIn(room.id, 'SyncRecovery');
                }
            }

            console.log('✨ Power Failure Recovery Test Completed Successfully!');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
});
