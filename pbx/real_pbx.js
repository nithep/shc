const { SerialPort } = require('serialport');

// TODO: Replace with the actual COM port or /dev/ttyUSB0 based on the Raspberry Pi / OS
const PORT_NAME = process.env.PBX_PORT || 'COM3';
const BAUD_RATE = 9600;

let port;

try {
    port = new SerialPort({
        path: PORT_NAME,
        baudRate: BAUD_RATE,
        autoOpen: false, // We'll open it manually to handle errors gracefully
    });

    port.open((err) => {
        if (err) {
            console.error(`[REAL PBX] Error opening port ${PORT_NAME}:`, err.message);
        } else {
            console.log(`[REAL PBX] Successfully connected to Phonik ECS via ${PORT_NAME}`);
        }
    });

    port.on('error', (err) => {
        console.error('[REAL PBX] Port Error: ', err.message);
    });

} catch (error) {
    console.error('[REAL PBX] Failed to initialize SerialPort:', error);
}

/**
 * Sends a command to the PBX to turn ON the relay for a specific room.
 * For Phonik ECS-103R, this typically involves sending a specific HEX string.
 */
function turnOnRelay(roomNumber) {
    console.log(`\n========================================`);
    console.log(`[REAL PBX - PRODUCTION]`);
    console.log(`🟢 COMMAND: Type 9 (ON) for Room ${roomNumber}`);
    
    // Example Hex Command (This needs to be adjusted based on the actual Phonik Protocol manual)
    // Format might be: STX (02) + Command + Room + ETX (03) + Checksum
    const hexCommand = Buffer.from([0x02, 0x09, roomNumber % 256, 0x01, 0x03]); 
    
    if (port && port.isOpen) {
        port.write(hexCommand, (err) => {
            if (err) {
                console.error(`[REAL PBX] Error writing to port:`, err.message);
            } else {
                console.log(`⚡ ACTION: Transmitting HEX payload to RS-232...`);
            }
        });
    } else {
        console.warn(`[REAL PBX] Port is not open. Skipping transmission.`);
    }

    console.log(`💡 EXPECTED RESULT: Room ${roomNumber} power relay activated.`);
    console.log(`========================================\n`);
    
    return "HARDWARE_ON_SIGNAL_SENT";
}

/**
 * Sends a command to the PBX to turn OFF the relay for a specific room.
 */
function turnOffRelay(roomNumber) {
    console.log(`\n========================================`);
    console.log(`[REAL PBX - PRODUCTION]`);
    console.log(`🔴 COMMAND: OFF for Room ${roomNumber}`);
    
    // Example Hex Command for OFF
    const hexCommand = Buffer.from([0x02, 0x09, roomNumber % 256, 0x00, 0x03]); 
    
    if (port && port.isOpen) {
        port.write(hexCommand, (err) => {
            if (err) {
                console.error(`[REAL PBX] Error writing to port:`, err.message);
            } else {
                console.log(`⚡ ACTION: Transmitting HEX payload to RS-232...`);
            }
        });
    } else {
        console.warn(`[REAL PBX] Port is not open. Skipping transmission.`);
    }

    console.log(`🌑 EXPECTED RESULT: Room ${roomNumber} power cut off.`);
    console.log(`========================================\n`);
    
    return "HARDWARE_OFF_SIGNAL_SENT";
}

module.exports = {
    turnOnRelay,
    turnOffRelay
};
