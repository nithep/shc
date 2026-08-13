#!/usr/bin/env node
'use strict';

const http = require('http');

const args = process.argv.slice(2);
const traceArg = args.find(arg => arg.startsWith('--trace-id='));
const typeArg = args.find(arg => arg.startsWith('--event-type='));

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

function buildQueryString() {
  const params = [];
  if (traceArg) params.push(`trace_id=${traceArg.split('=')[1]}`);
  if (typeArg) params.push(`event_type=${typeArg.split('=')[1]}`);
  return params.length > 0 ? `?${params.join('&')}` : '';
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
    const qs = buildQueryString();
    const data = await get(`/api/audit/events${qs}`);
    if (!data.success) {
      throw new Error('API failed: ' + JSON.stringify(data));
    }

    console.log(`📋 Audit Log query results (${data.events.length} records):`);
    console.log('========================================');
    if (data.events.length === 0) {
      console.log('No logs found matching criteria.');
      return;
    }

    for (const ev of data.events) {
      console.log(`[${ev.timestamp}] Event: ${ev.event_type} | Trace ID: ${ev.trace_id}`);
      console.log(`  Command   : ${ev.command_type} | Room: ${JSON.stringify(ev.target_rooms)} | Requested By: ${ev.requested_by}`);
      if (ev.payload.approval) {
        console.log(`  Decision  : ${ev.payload.approval.decided_by} at ${ev.payload.approval.decided_at}`);
        console.log(`  Reason    : "${ev.payload.approval.reason}"`);
      }
      if (ev.payload.error) {
        console.log(`  Error     : ${ev.payload.error}`);
      }
      console.log('----------------------------------------');
    }
  } catch (err) {
    console.error('❌ Failed to query audit logs:', err.message);
    process.exit(1);
  }
}

run();
