#!/usr/bin/env node
'use strict';

const http = require('http');

const args = process.argv.slice(2);
const roomArg = args.find(arg => arg.startsWith('--room='));
const cmdArg = args.find(arg => arg.startsWith('--cmd='));

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

if (!roomArg || !cmdArg) {
  console.log('Usage:');
  console.log('  npm run pbx:dry-run -- --room=101 --cmd=ON');
  console.log('  npm run pbx:dry-run -- --room=101 --cmd=OFF');
  process.exit(1);
}

const roomNum = roomArg.split('=')[1];
const cmd = cmdArg.split('=')[1].toUpperCase();

if (cmd !== 'ON' && cmd !== 'OFF') {
  console.error('❌ Error: --cmd must be either ON or OFF');
  process.exit(1);
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  const path = cmd === 'ON' ? '/api/checkin' : '/api/checkout';
  const payload = {
    roomNumber: roomNum,
    dryRun: true,
  };

  console.log(`🧪 Performing Dry-run for Room ${roomNum} | Command: ${cmd}...`);
  console.log('========================================');

  try {
    const { statusCode, body } = await post(path, payload);

    if (statusCode === 202) {
      console.log('🟠 Result: APPROVAL REQUIRED (High-risk command)');
      console.log(`   Risk Code : ${body.classification.riskCode}`);
      console.log(`   Risk Name : ${body.classification.riskName}`);
      console.log(`   Message   : ${body.message}`);
      console.log(`   Approval ID: ${body.approvalId}`);
    } else if (statusCode === 429) {
      console.log('🔴 Result: RATE LIMITED');
      console.log(`   Message   : ${body.message}`);
      console.log(`   Reset At  : ${body.resetAt}`);
    } else if (statusCode === 200) {
      console.log('✅ Result: DRY-RUN PASSED');
      console.log(`   Message   : ${body.message}`);
      console.log(`   Trace ID  : ${body.trace_id}`);
      console.log(`   Details   : ${JSON.stringify(body.hardware_status)}`);
    } else {
      console.log(`❌ Result: ERROR (Status ${statusCode})`);
      console.log(`   Details   : ${JSON.stringify(body)}`);
    }
  } catch (err) {
    console.error('❌ Dry-run request failed:', err.message);
    process.exit(1);
  }
}

run();
