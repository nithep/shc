#!/usr/bin/env node
// =============================================================================
// Hotel-ECS — Database Migration & Seed Script
// ใช้แทน hotel.db ที่เคยเก็บไว้บน Pi4 โดยตรง
// รัน: node backend/scripts/migrate.js
// =============================================================================

'use strict';

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(__dirname, '..', 'hotel.db');

const SEED_ROOMS = [
  { id: 101, status: 'vacant', power: false },
  { id: 102, status: 'vacant', power: false },
  { id: 103, status: 'vacant', power: false },
  { id: 104, status: 'vacant', power: false },
  { id: 105, status: 'vacant', power: false },
  { id: 106, status: 'vacant', power: false },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(msg)  { console.log(`[migrate] ${msg}`); }
function warn(msg) { console.warn(`[migrate] ⚠️  ${msg}`); }
function ok(msg)   { console.log(`[migrate] ✅ ${msg}`); }
function err(msg)  { console.error(`[migrate] ❌ ${msg}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────
log(`Database path: ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, (connectErr) => {
  if (connectErr) {
    err(`Cannot open database: ${connectErr.message}`);
    process.exit(1);
  }
  ok('Connected to SQLite database.');
  runMigrations();
});

function runMigrations() {
  db.serialize(() => {

    // ── Migration 001: Create rooms table ──────────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id               INTEGER PRIMARY KEY,
        status           TEXT    NOT NULL DEFAULT 'vacant',
        power            BOOLEAN NOT NULL DEFAULT 0,
        guest_name       TEXT,
        guest_email      TEXT,
        consent_given_at TEXT,
        consent_ip       TEXT,
        checkout_date    TEXT,
        branch_id        TEXT    DEFAULT 'branch_01'
      )
    `, (e) => {
      if (e) { err(`rooms table: ${e.message}`); return; }
      ok('Migration 001 — rooms table: OK');
    });

    // ── Migration 002: Create bookings table ───────────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id        INTEGER NOT NULL,
        guest_name     TEXT    NOT NULL,
        status         TEXT    DEFAULT 'pending_binding',
        binding_token  TEXT    UNIQUE,
        guest_line_id  TEXT,
        guest_session_id TEXT,
        checkin_date   TEXT,
        checkout_date  TEXT,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (e) => {
      if (e) { err(`bookings table: ${e.message}`); return; }
      ok('Migration 002 — bookings table: OK');
    });

    // ── Migration 003: Add missing columns (idempotent) ────────────────────
    const alterColumns = [
      { table: 'rooms', name: 'branch_id',        type: 'TEXT DEFAULT "branch_01"' },
      { table: 'rooms', name: 'guest_email',       type: 'TEXT' },
      { table: 'rooms', name: 'consent_given_at',  type: 'TEXT' },
      { table: 'rooms', name: 'consent_ip',        type: 'TEXT' },
      { table: 'rooms', name: 'checkout_date',     type: 'TEXT' },
    ];

    alterColumns.forEach(({ table, name, type }) => {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`, (e) => {
        // SQLite returns error if column already exists — ignore it (idempotent)
        if (e && !e.message.includes('duplicate column name')) {
          warn(`ALTER ${table}.${name}: ${e.message}`);
        } else if (!e) {
          log(`Migration 003 — Added column ${table}.${name}`);
        }
      });
    });

    // ── Seed 001: Initial rooms (ไม่มีข้อมูลแขกจริง) ─────────────────────
    db.get('SELECT COUNT(*) AS count FROM rooms', (e, row) => {
      if (e) { err(`Seed check: ${e.message}`); return; }

      if (row && row.count === 0) {
        const stmt = db.prepare(
          'INSERT INTO rooms (id, status, power) VALUES (?, ?, ?)'
        );
        SEED_ROOMS.forEach(r => stmt.run(r.id, r.status, r.power ? 1 : 0));
        stmt.finalize();
        ok(`Seed 001 — Inserted ${SEED_ROOMS.length} initial rooms (all vacant, power off).`);
      } else {
        log(`Seed 001 — Skipped: ${row.count} room(s) already exist.`);
      }

      // ── Done ─────────────────────────────────────────────────────────────
      db.close((closeErr) => {
        if (closeErr) { warn(`Close: ${closeErr.message}`); }
        console.log('');
        ok('Migration complete. Database is ready.');
        console.log(`   Path: ${DB_PATH}`);
        console.log('');
      });
    });
  });
}
