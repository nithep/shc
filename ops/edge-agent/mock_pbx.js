/**
 * Mock PBX Simulator (Digital Twin)
 * This script simulates the Phonik PBX ECS-103R V.5 behavior.
 * Instead of sending real voltages to the relay, it logs the actions to the terminal.
 */

// Simulate a Type 9 (ON) command sent to PBX
function turnOnRelay(roomNumber) {
    console.log(`\n========================================`);
    console.log(`[DIGITAL TWIN - PBX SIMULATOR]`);
    console.log(`🟢 COMMAND: Type 9 (ON) received for Room ${roomNumber}`);
    console.log(`⚡ ACTION: Unlocking Relay...`);
    console.log(`💡 RESULT: Room ${roomNumber} is now POWERED ON.`);
    console.log(`========================================\n`);
    return { success: true, room: roomNumber, status: 'ON' };
}

// Simulate an OFF command sent to PBX
function turnOffRelay(roomNumber) {
    console.log(`\n========================================`);
    console.log(`[DIGITAL TWIN - PBX SIMULATOR]`);
    console.log(`🔴 COMMAND: OFF received for Room ${roomNumber}`);
    console.log(`⚡ ACTION: Cutting Power Relay...`);
    console.log(`🌑 RESULT: Room ${roomNumber} is now POWERED OFF (Total Cut).`);
    console.log(`========================================\n`);
    return { success: true, room: roomNumber, status: 'OFF' };
}

module.exports = {
    turnOnRelay,
    turnOffRelay
};
