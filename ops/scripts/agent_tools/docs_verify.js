#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOCS_RAW = path.join(__dirname, '..', '..', 'docs', 'raw');
const MANIFEST_PATH = path.join(DOCS_RAW, 'MANIFEST.sha256');

function getSHA256(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verify() {
  console.log('🔍 Starting World Model Verification...');
  console.log('========================================');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ Error: MANIFEST.sha256 not found in docs/raw/');
    process.exit(1);
  }

  const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifestLines = manifestContent.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  const expectedHashes = {};
  for (const line of manifestLines) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (match) {
      const hash = match[1];
      const relPath = match[2];
      expectedHashes[relPath] = hash;
    }
  }

  // Find all files in docs/raw recursively except MANIFEST.sha256
  const filesToCheck = [];
  function walk(dir) {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const rel = path.relative(DOCS_RAW, fullPath).replace(/\\/g, '/');
        if (rel !== 'MANIFEST.sha256') {
          filesToCheck.push({ fullPath, rel });
        }
      }
    }
  }

  try {
    walk(DOCS_RAW);
  } catch (err) {
    console.error('❌ Error walking raw directory:', err.message);
    process.exit(1);
  }

  let failed = false;
  console.log(`Checking ${filesToCheck.length} files in docs/raw/...`);

  for (const file of filesToCheck) {
    const actualHash = getSHA256(file.fullPath);
    const expectedHash = expectedHashes[file.rel];

    if (!expectedHash) {
      console.warn(`⚠️  Warning: File "${file.rel}" is not tracked in MANIFEST.sha256! (Actual Hash: ${actualHash})`);
      failed = true;
      continue;
    }

    if (actualHash !== expectedHash) {
      console.error(`❌ Error: Checksum mismatch for "${file.rel}"!`);
      console.error(`   Expected: ${expectedHash}`);
      console.error(`   Actual  : ${actualHash}`);
      failed = true;
    } else {
      console.log(`✅ ${file.rel}: Match`);
    }
  }

  // Check if there are expected files that do not exist
  for (const rel of Object.keys(expectedHashes)) {
    const fullPath = path.join(DOCS_RAW, rel);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Error: Tracked file "${rel}" in MANIFEST.sha256 does not exist physically!`);
      failed = true;
    }
  }

  console.log('========================================');
  if (failed) {
    console.error('❌ World Model Verification failed. Raw specs or logs have been tampered with or are untracked.');
    process.exit(1);
  } else {
    console.log('🎉 World Model Verification successful. All immutable raw specifications and logs match ground truth.');
  }
}

verify();
