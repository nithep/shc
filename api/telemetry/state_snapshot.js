'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');

// Ensure snapshot directory exists
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

/**
 * Capture a complete snapshot of the system states:
 * - Local Database room status
 * - Physical PBX status (via pbx connector)
 * - Environmental telemetry details
 *
 * @param {object} pbxConnector - Active PBX Connector instance
 * @returns {Promise<object>} Captured snapshot object
 */
async function captureStateSnapshot(pbxConnector) {
  return new Promise((resolve, reject) => {
    db.getAllRooms(async (err, dbRooms) => {
      if (err) {
        return reject(new Error('Failed to fetch rooms from DB for snapshot: ' + err.message));
      }

      const roomsPayload = [];

      for (const room of dbRooms) {
        let pbxStatus = 'UNKNOWN';
        let pbxError = null;

        try {
          if (pbxConnector && pbxConnector.isConnected()) {
            const statusObj = await pbxConnector.getRoomStatus(room.id);
            pbxStatus = statusObj.status;
          }
        } catch (err) {
          pbxStatus = 'ERROR';
          pbxError = err.message;
        }

        roomsPayload.push({
          room_id: room.id,
          db_status: room.status, // vacant / occupied
          db_power: room.power,   // true / false
          pbx_power_status: pbxStatus, // ON / OFF / UNKNOWN / ERROR
          pbx_error: pbxError,
          mismatch: (room.power && pbxStatus === 'OFF') || (!room.power && pbxStatus === 'ON'),
        });
      }

      const snapshot = {
        timestamp: new Date().toISOString(),
        device_mode: pbxConnector ? pbxConnector.config.mode : 'unknown',
        connected: pbxConnector ? pbxConnector.isConnected() : false,
        total_rooms: dbRooms.length,
        mismatch_count: roomsPayload.filter(r => r.mismatch).length,
        rooms: roomsPayload,
      };

      const filename = `snapshot_${Date.now()}.json`;
      const filepath = path.join(SNAPSHOT_DIR, filename);

      try {
        fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2), 'utf8');
      } catch (writeErr) {
        console.error('Failed to write state snapshot file:', writeErr.message);
      }

      resolve(snapshot);
    });
  });
}

/**
 * List all saved state snapshots.
 * @returns {Array<string>} List of snapshot filenames
 */
function listSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(file => file.startsWith('snapshot_') && file.endsWith('.json'))
    .sort();
}

/**
 * Get snapshot content by filename.
 * @param {string} filename
 * @returns {object|null} Snapshot contents
 */
function getSnapshot(filename) {
  const filepath = path.join(SNAPSHOT_DIR, path.basename(filename));
  if (!fs.existsSync(filepath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = {
  captureStateSnapshot,
  listSnapshots,
  getSnapshot,
};
