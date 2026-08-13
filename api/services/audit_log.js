'use strict';

const { randomUUID } = require('crypto');

const EVENT_TYPES = Object.freeze({
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  TIMED_OUT: 'TIMED_OUT',
  EXPIRED: 'EXPIRED',
  AUTO_PASSED: 'AUTO_PASSED',
});

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function initAuditLog(db) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS approval_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      trace_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      command_type TEXT,
      risk_code TEXT,
      target_rooms TEXT NOT NULL,
      requested_by TEXT,
      dry_run INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL
    )`);

    db.run('CREATE INDEX IF NOT EXISTS idx_audit_trace_id ON approval_audit_events (trace_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON approval_audit_events (timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_event_type ON approval_audit_events (event_type)');
  });
}

function sanitizeCommandForAudit(command = {}) {
  const targetRooms = Array.isArray(command.targetRooms) ? command.targetRooms : [];
  const metadata = command.metadata || {};

  return {
    command_type: command.commandType || 'UNKNOWN',
    risk_code: command.riskCode || null,
    target_rooms: targetRooms,
    requested_by: command.requestedBy || 'system:unknown',
    source: command.source || 'unknown',
    dry_run: Boolean(command.dryRun),
    execution_mode: command.executionMode || 'unknown',
    guest_name_provided: Boolean(command.guestName),
    metadata: {
      persist_room_state: metadata.persistRoomState !== false,
      flow: metadata.flow || null,
      reason: metadata.reason || null,
    },
  };
}

function normalizeAuditEvent(event) {
  const command = sanitizeCommandForAudit(event.command || {});
  const timestamp = event.timestamp || new Date().toISOString();

  return {
    event_id: event.eventId || event.event_id || randomUUID(),
    trace_id: event.traceId || event.trace_id || (event.command && event.command.traceId) || randomUUID(),
    timestamp,
    event_type: event.eventType || event.event_type || EVENT_TYPES.AUTO_PASSED,
    command_type: command.command_type,
    risk_code: command.risk_code,
    target_rooms: command.target_rooms,
    requested_by: command.requested_by,
    dry_run: command.dry_run,
    payload: {
      event_id: event.eventId || event.event_id,
      trace_id: event.traceId || event.trace_id || (event.command && event.command.traceId),
      timestamp,
      event_type: event.eventType || event.event_type || EVENT_TYPES.AUTO_PASSED,
      command,
      approval: event.approval || null,
      expiry: event.expiry || null,
      decision: event.decision || null,
      result: event.result || null,
      error: event.error || null,
    },
  };
}

function appendAuditEvent(db, event) {
  const row = normalizeAuditEvent(event);
  row.payload.event_id = row.event_id;
  row.payload.trace_id = row.trace_id;

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO approval_audit_events
        (event_id, trace_id, timestamp, event_type, command_type, risk_code,
         target_rooms, requested_by, dry_run, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.event_id,
        row.trace_id,
        row.timestamp,
        row.event_type,
        row.command_type,
        row.risk_code,
        JSON.stringify(row.target_rooms),
        row.requested_by,
        row.dry_run ? 1 : 0,
        JSON.stringify(row.payload),
      ],
      function onInserted(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({ ...row.payload, id: this.lastID });
      }
    );
  });
}

function listAuditEvents(db, filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.traceId) {
    clauses.push('trace_id = ?');
    params.push(filters.traceId);
  }

  if (filters.eventType) {
    clauses.push('event_type = ?');
    params.push(filters.eventType);
  }

  if (filters.commandType) {
    clauses.push('command_type = ?');
    params.push(filters.commandType);
  }

  const parsedLimit = Number.parseInt(filters.limit, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM approval_audit_events ${where} ORDER BY id DESC LIMIT ?`;
  params.push(limit);

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows.map((row) => ({
        id: row.id,
        event_id: row.event_id,
        trace_id: row.trace_id,
        timestamp: row.timestamp,
        event_type: row.event_type,
        command_type: row.command_type,
        risk_code: row.risk_code,
        target_rooms: JSON.parse(row.target_rooms || '[]'),
        requested_by: row.requested_by,
        dry_run: row.dry_run === 1,
        payload: JSON.parse(row.payload_json),
      })));
    });
  });
}

module.exports = {
  EVENT_TYPES,
  initAuditLog,
  appendAuditEvent,
  listAuditEvents,
  sanitizeCommandForAudit,
};
