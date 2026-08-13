/**
 * Test script for Queue Safety Timeout feature
 * Tests that the executeHardwareCommand properly times out and prevents deadlock
 */

const { CommandQueue } = require('./queue.js');

async function testTimeoutProtection() {
  console.log('\n🧪 Testing Queue Safety Timeout Protection...\n');
  
  const queue = new CommandQueue();
  
  // Test 1: Normal command (should complete)
  console.log('Test 1: Normal command execution...');
  try {
    const result = await queue.add(async () => {
      return 'SUCCESS';
    });
    console.log('✅ Test 1 PASSED: Normal command completed -', result);
  } catch (error) {
    console.error('❌ Test 1 FAILED:', error.message);
  }
  
  // Test 2: Slow command (should timeout after 5s)
  console.log('\nTest 2: Slow command timeout protection...');
  const startTime = Date.now();
  try {
    await queue.add(async () => {
      // Simulate hardware that never responds (10s delay > 5s timeout)
      await new Promise(resolve => setTimeout(resolve, 10000));
      return 'SHOULD_NOT_REACH';
    });
    console.error('❌ Test 2 FAILED: Command did not timeout');
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (error.message.includes('HARDWARE_TIMEOUT') && elapsed < 6000) {
      console.log(`✅ Test 2 PASSED: Timeout triggered after ${elapsed}ms`);
      console.log('   Error message:', error.message);
    } else {
      console.error('❌ Test 2 FAILED: Wrong error or timing', error.message, 'elapsed:', elapsed);
    }
  }
  
  // Test 3: Queue recovery after timeout (should accept next command)
  console.log('\nTest 3: Queue recovery after timeout...');
  try {
    const result = await queue.add(async () => {
      return 'RECOVERED';
    });
    console.log('✅ Test 3 PASSED: Queue recovered and processed next command -', result);
  } catch (error) {
    console.error('❌ Test 3 FAILED: Queue did not recover:', error.message);
  }
  
  console.log('\n🎉 All tests completed!\n');
}

testTimeoutProtection().catch(console.error);
