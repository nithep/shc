/**
 * scripts/start-sim-server.js
 * เปิดใช้งาน Backend API และ PBX Simulator ค้างไว้ (Persistent)
 * เพื่อใช้ทดสอบกับโทรศัพท์มือถือผ่านเครือข่าย Wi-Fi
 */

const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('🚀 กำลังเปิดบริการ Backend และ PBX Simulator สำหรับการทดสอบผ่านมือถือ...');

// 1. เปิด PBX Simulator
const pbxProcess = spawn('node', ['pbx-connector/simulator/pbx-simulator.js', '--port', '10001', '--delay', '20', '--nack-room', '103'], {
    cwd: rootDir,
    stdio: 'inherit'
});

// 2. เปิด Backend Server (เสิร์ฟทั้ง API และ Frontend บนพอร์ต 3000)
const backendProcess = spawn('node', ['backend/server.js'], {
    cwd: rootDir,
    env: {
        ...process.env,
        PORT: '3000',
        PBX_MODE: 'tcp',
        PBX_HOST: '127.0.0.1',
        PBX_PORT: '10001',
        ENFORCE_SCHEDULE: 'false',
        DATABASE_PATH: path.join(rootDir, 'backend', 'hotel.db')
    },
    stdio: 'inherit'
});

function cleanup() {
    console.log('\n🧹 กำลังปิดระบบจำลอง...');
    if (pbxProcess) pbxProcess.kill();
    if (backendProcess) backendProcess.kill();
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log('\n======================================================');
console.log('✅ ระบบทำงานแล้ว!');
console.log('📱 หากต้องการทดสอบบนมือถือ ให้หา IP ของเครื่องนี้ (เช่น 192.168.x.x)');
console.log('   แล้วเปิดเบราว์เซอร์ในมือถือไปที่: http://<IP>:3000/');
console.log('กด Ctrl+C เพื่อหยุดการทำงาน');
console.log('======================================================\n');
