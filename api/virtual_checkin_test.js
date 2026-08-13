const { createConnector } = require('../pbx');
const db = require('./db');

async function runVirtualTest() {
    console.log('⚡ Starting Virtual Check-in Test for Rooms 101-104...');
    
    // Create connector in mock mode
    const pbx = createConnector({
        mode: 'mock',
        host: '127.0.0.1',
        port: 5000
    });

    try {
        await pbx.connect();
        console.log('✅ Connected to PBX (Mock Mode).');
        
        const roomsToTest = [101, 102, 103, 104];
        
        for (const room of roomsToTest) {
            console.log(`\n--- Testing Check-in for Room ${room} ---`);
            const guestName = `TestGuest${room}`;
            
            // Execute checkIn
            console.log(`[TEST] Checking in room ${room} with guest name ${guestName}...`);
            const hardwareResult = await pbx.checkIn(room, guestName, 1);
            
            console.log(`[TEST] PBX Result:`, hardwareResult);
            
            // Check status again
            const status = await pbx.getRoomStatus(room);
            console.log(`[TEST] PBX Room Status:`, status);
            
            // Check guest name
            const guest = await pbx.getGuestName(room);
            console.log(`[TEST] PBX Guest Name:`, guest);
            
            // Sync with Database
            await new Promise((resolve, reject) => {
                db.updateRoomState(room, 'occupied', true, { guestName }, (err) => {
                    if (err) {
                        console.error(`[DB] Failed to update room ${room} state:`, err.message);
                        reject(err);
                    } else {
                        console.log(`✅ Room ${room} updated to occupied in database.`);
                        resolve();
                    }
                });
            });
        }
        
        console.log('\n✨ Virtual Check-in Test Completed Successfully!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

runVirtualTest();
