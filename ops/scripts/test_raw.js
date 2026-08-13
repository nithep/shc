const net = require('net');

const client = new net.Socket();
const commands = [
  '..tcmd=1\r\n',
  '..VERS=\r\n',
  '..PASS=1234\r\n',
  '..PWER0101=0\r\n', // turn off room 101 using 0101
  '..PWER=ALL\r\n',
];

let cmdIndex = 0;

client.connect(23, '192.168.1.91', () => {
  console.log('Connected to PBX');
});

client.on('data', (data) => {
  console.log(`Received: ${JSON.stringify(data.toString())}`);
  if (cmdIndex < commands.length) {
    const nextCmd = commands[cmdIndex++];
    console.log(`Sending: ${JSON.stringify(nextCmd)}`);
    client.write(nextCmd);
  } else {
    client.destroy();
  }
});

client.on('close', () => {
  console.log('Connection closed');
});

client.on('error', (err) => {
  console.error('Error:', err);
});
