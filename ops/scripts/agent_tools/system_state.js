#!/usr/bin/env node
'use strict';

const http = require('http');

const args = process.argv.slice(2);
const roomArg = args.find(arg => arg.startsWith('--room='));
const allArg = args.includes('--all');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

if (!roomArg && !allArg) {
  console.log('Usage:');
  console.log('  npm run system:state -- --room=101');
  console.log('  npm run system:state -- --all');
  process.exit(1);
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://${HOST}:${PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  try {
    const data = await get('/api/rooms');
    if (!data.success) {
      throw new Error('API failed: ' + JSON.stringify(data));
    }

    if (allArg) {
      console.log('🏨 System State Snapshot (All Rooms):');
      console.log('========================================');
      console.table(data.rooms.map(r => ({
        'Room ID': r.id,
        'Database Status': r.status,
        'Power Status': r.power ? '🔌 ON' : '🌑 OFF',
      })));
    } else {
      const roomNum = roomArg.split('=')[1];
      const room = data.rooms.find(r => String(r.id) === String(roomNum));
      if (!room) {
        console.error(`❌ Error: Room ${roomNum} not found in database.`);
        process.exit(1);
      }

      // Query live hardware status
      let pbxStatus = 'UNKNOWN';
      try {
        const live = await get(`/api/rooms/${roomNum}/status`);
        if (live.success) {
          pbxStatus = live.statusLabel;
        }
      } catch (_) {
        pbxStatus = 'OFFLINE/UNREACHABLE';
      }

      console.log(`🏨 State Details for Room ${roomNum}:`);
      console.log('========================================');
      console.log(`Room Number    : ${room.id}`);
      console.log(`Database Status: ${room.status} (occupied/vacant)`);
      console.log(`Database Power : ${room.power ? 'ON' : 'OFF'}`);
      console.log(`PBX Live State : ${pbxStatus}`);
    }
  } catch (err) {
    console.error('❌ Failed to fetch system state:', err.message);
    process.exit(1);
  }
}

run();
