#!/usr/bin/env node
'use strict';

const { exec } = require('child_process');
const path = require('path');

const PBX_CONNECTOR_DIR = path.join(__dirname, '..', '..', 'pbx-connector');

console.log('🧪 Running Test Suite and generating report...');
console.log('========================================');

exec('npm run test:jest:unit', { cwd: PBX_CONNECTOR_DIR }, (err, stdout, stderr) => {
  // Jest outputs its status to stderr since it's a test runner, not stdout
  const output = stdout + '\n' + stderr;

  console.log(output);
  console.log('========================================');
  
  if (err) {
    console.error('❌ Test execution failed. Some unit tests did not pass.');
    process.exit(1);
  } else {
    console.log('🎉 Test Report: SUCCESS. All unit tests and fixture regressions passed!');
  }
});
