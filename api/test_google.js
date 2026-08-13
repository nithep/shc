const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleNotifier } = require('./services/google_notifier');

async function test() {
    console.log('[TEST] Initializing GoogleNotifier...');
    const notifier = new GoogleNotifier();
    
    console.log('[TEST] Chat Active:', notifier.isChatActive());
    console.log('[TEST] Sheets Active:', notifier.isSheetsActive());
    
    if (!notifier.isChatActive() && !notifier.isSheetsActive()) {
        console.error('[TEST] Error: No webhooks are active! Please check your environment variables.');
        process.exit(1);
    }
    
    console.log('[TEST] Sending Check-In Alert for Room 999...');
    const chatResult = await notifier.sendCheckinAlert({
        roomNumber: '999',
        guestName: 'คุณทดสอบ ระบบกูเกิล (Test User)',
        time: new Date().toLocaleString('th-TH')
    });
    
    console.log('[TEST] Check-In Alert Result:', chatResult);
    
    console.log('[TEST] Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('[TEST] Sending Check-Out Alert for Room 999...');
    const checkoutResult = await notifier.sendCheckoutAlert({
        roomNumber: '999',
        time: new Date().toLocaleString('th-TH')
    });
    
    console.log('[TEST] Check-Out Alert Result:', checkoutResult);
    console.log('[TEST] Test completed.');
}

test().catch(err => {
    console.error('[TEST] Unexpected error:', err);
    process.exit(1);
});
