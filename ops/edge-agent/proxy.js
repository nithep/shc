const net = require('net');

const LISTEN_PORT = 23; // ใช้ Port 23 เพื่อให้ PC Operator เชื่อมต่อได้เลย
const TARGET_IP = '192.168.1.91';
const TARGET_PORT = 23;

const server = net.createServer((clientSocket) => {
    console.log('=== Client connected from PC Operator ===');
    
    const targetSocket = new net.Socket();
    targetSocket.connect(TARGET_PORT, TARGET_IP, () => {
        console.log(`=== Connected to PBX ${TARGET_IP}:${TARGET_PORT} ===`);
    });

    clientSocket.on('data', (data) => {
        console.log(`\n[PC Operator -> PBX] (${data.length} bytes):`);
        console.log(`HEX: ${data.toString('hex')}`);
        console.log(`STR: ${data.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`);
        targetSocket.write(data);
    });

    targetSocket.on('data', (data) => {
        console.log(`\n[PBX -> PC Operator] (${data.length} bytes):`);
        console.log(`HEX: ${data.toString('hex')}`);
        console.log(`STR: ${data.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`);
        clientSocket.write(data);
    });

    clientSocket.on('close', () => {
        console.log('=== PC Operator disconnected ===');
        targetSocket.destroy();
    });
    targetSocket.on('close', () => {
        console.log('=== PBX disconnected ===');
        clientSocket.destroy();
    });
    clientSocket.on('error', (err) => console.error('Client error:', err));
    targetSocket.on('error', (err) => console.error('PBX error:', err));
});

server.listen(LISTEN_PORT, () => {
    console.log(`\n🚀 Proxy is running on port ${LISTEN_PORT}`);
    console.log(`👉 วิธีใช้งาน:`);
    console.log(`1. ปิดการเชื่อมต่อใน Phonik PC Operator ก่อน`);
    console.log(`2. เปลี่ยน IP ในช่องของ Phonik PC Operator เป็น 127.0.0.1`);
    console.log(`3. กดเชื่อมต่อ และลองสั่งเปิด/ปิดไฟห้อง 104 ดูครับ`);
    console.log(`4. สคริปต์นี้จะดักจับคำสั่งลับ (Secret Command) ที่โปรแกรมส่งไปหาตู้ PBX ให้ดูสดๆ เลยครับ!\n`);
});
