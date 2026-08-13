const net = require('net');
const host = '192.168.1.91';
const port = 23;

const client = new net.Socket();

console.log(`Connecting to ${host}:${port} ...`);

client.connect(port, host, function() {
    console.log('Connected! Type your command and press Enter. (e.g. ..VERS= หรือ ..ROOM0101=1)');
});

client.on('data', function(data) {
    // พิมพ์ข้อมูลที่ได้รับจาก PBX
    console.log('<< PBX: ' + data.toString().trim());
});

client.on('close', function() {
    console.log('Connection closed');
    process.exit();
});

client.on('error', function(err) {
    console.error('Error:', err.message);
    process.exit(1);
});

// อ่านข้อมูลจาก stdin แล้วส่งไปให้ PBX พร้อมกับ \r\n (CRLF)
process.stdin.on('data', function(data) {
    const cmd = data.toString().trim();
    if (cmd) {
        client.write(cmd + '\r\n');
        console.log('>> SENT: ' + cmd);
    }
});
