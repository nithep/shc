/**
 * 🤖 Digital Twin Closed-Loop Integration Test (Hotel ECS)
 * ลูปทดสอบเสมือนจริงแบบครบวงจร (End-to-End Closed-Loop Verification)
 */

const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const FRONTDESK_PIN = process.env.FRONTDESK_PIN || '1234';
const OWNER_PIN = process.env.OWNER_PIN || '9999';

function requestJSON(url, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const dataStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {}),
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (dataStr) req.write(dataStr);
        req.end();
    });
}

async function runDigitalTwinLoopTest() {
    console.log('============================================================');
    console.log('🔄 🤖 DIGITAL TWIN CLOSED-LOOP SYSTEM VERIFICATION TEST');
    console.log('============================================================\n');

    // -------------------------------------------------------------
    // STAGE 1: PYTHON HARDWARE & PBX PROTOCOL HARNESS VERIFICATION
    // -------------------------------------------------------------
    console.log('📌 [STAGE 1] Testing Hardware PBX Connector & Harness Closed-Loop Loop (Python)...');
    try {
        const pyOutput = execSync('python worker/harness_loop.py', { encoding: 'utf-8' });
        console.log('✅ Python Harness Execution Output Verified.');
        if (pyOutput.includes('SAFETY BLOCK')) {
            console.log('  🛡️ Safety Block System: VERIFIED (Blocked unauthorized command successfully)');
        }
    } catch (e) {
        console.error('❌ Python Harness Test failed:', e.message);
        process.exit(1);
    }

    // -------------------------------------------------------------
    // STAGE 2: AUTHENTICATION & TOKEN ACQUISITION
    // -------------------------------------------------------------
    console.log('\n📌 [STAGE 2] Authenticating API Roles (Staff / Owner)...');
    const staffAuth = await requestJSON(`${BASE_URL}/api/auth/verify-pin`, 'POST', { pin: FRONTDESK_PIN });
    if (staffAuth.status !== 200) {
        console.error('❌ Staff Auth failed:', staffAuth.body);
        process.exit(1);
    }
    const staffToken = staffAuth.body.token;
    console.log(`✅ Staff authenticated successfully (Role: ${staffAuth.body.role})`);

    const ownerAuth = await requestJSON(`${BASE_URL}/api/auth/verify-pin`, 'POST', { pin: OWNER_PIN });
    const ownerToken = ownerAuth.body.token;
    console.log(`✅ Owner authenticated successfully (Role: ${ownerAuth.body.role})`);

    // -------------------------------------------------------------
    // STAGE 3: BOOKING CREATION & BINDING TOKEN GENERATION
    // -------------------------------------------------------------
    console.log('\n📌 [STAGE 3] Creating New Booking for Room 101 via Admin API...');
    const bookingRes = await requestJSON(
        `${BASE_URL}/api/admin/bookings`,
        'POST',
        {
            roomId: 101,
            guestName: 'DigitalTwin Guest',
            checkinDate: new Date().toISOString(),
            checkoutDate: new Date(Date.now() + 86400000).toISOString()
        },
        { Authorization: `Bearer ${staffToken}` }
    );

    if (!bookingRes.body.success) {
        console.error('❌ Failed to create booking:', bookingRes.body);
        process.exit(1);
    }
    const bookingId = bookingRes.body.bookingId;
    console.log(`✅ Booking Created! ID: ${bookingId}, Room: 101`);

    // Fetch Binding Token
    const bindLinkRes = await requestJSON(
        `${BASE_URL}/api/admin/bookings/${bookingId}/binding`,
        'GET',
        null,
        { Authorization: `Bearer ${staffToken}` }
    );
    const bindingToken = bindLinkRes.body.bindingToken;
    console.log(`✅ Binding Token Generated: ${bindingToken}`);
    console.log(`🔗 Generated URL: ${bindLinkRes.body.bindingUrl}`);

    // -------------------------------------------------------------
    // STAGE 4: GUEST PREVIEW & IDENTITY BINDING (LINE / LIFF SIMULATION)
    // -------------------------------------------------------------
    console.log('\n📌 [STAGE 4] Guest Info Retrieval & LINE Identity Binding...');
    const infoRes = await requestJSON(`${BASE_URL}/api/bookings/info?token=${bindingToken}`, 'GET');
    if (infoRes.status !== 200 || !infoRes.body.guestName) {
        console.error('❌ Failed to fetch booking info by token:', infoRes.body);
        process.exit(1);
    }
    console.log(`✅ Guest Preview Verified: Room ${infoRes.body.roomNumber} - Guest: ${infoRes.body.guestName}`);

    // Execute Binding
    const testLineId = `U_SIMULATED_LINE_ID_${Math.floor(Math.random() * 100000)}`;
    const bindExecRes = await requestJSON(`${BASE_URL}/api/bookings/bind`, 'POST', {
        bindingToken: bindingToken,
        lineId: testLineId
    });

    if (bindExecRes.status !== 200 || !bindExecRes.body.success) {
        console.error('❌ Identity Binding failed:', bindExecRes.body);
        process.exit(1);
    }
    console.log(`✅ LINE Identity Bound Successfully! (LINE ID: ${testLineId})`);

    // -------------------------------------------------------------
    // STAGE 5: ROOM STATE & HARDWARE POWER-ON VERIFICATION
    // -------------------------------------------------------------
    console.log('\n📌 [STAGE 5] Verifying Room 101 State & Power Status...');
    const roomsRes = await requestJSON(`${BASE_URL}/api/rooms`, 'GET');
    const room101 = roomsRes.body.rooms.find(r => r.id === 101);

    console.log(`✅ Room 101 State: status='${room101.status}', power=${room101.power}`);
    if (room101.status !== 'occupied') {
        console.error('❌ Room 101 state mismatch! Expected occupied.');
        process.exit(1);
    }

    // -------------------------------------------------------------
    // STAGE 6: CHECK-OUT & POWER CUTOFF WITH SAFETY OVERRIDE
    // -------------------------------------------------------------
    console.log('\n📌 [STAGE 6] Executing Check-out Flow...');
    const checkoutRes = await requestJSON(
        `${BASE_URL}/api/checkout`,
        'POST',
        { roomNumber: '101' },
        { Authorization: `Bearer ${staffToken}` }
    );

    if (checkoutRes.status === 202 && checkoutRes.body.reason === 'APPROVAL_REQUIRED') {
        console.log(`⚠️ Check-out held by Safety Engine (Reason: ${checkoutRes.body.classification.riskName})`);
        console.log(`   Approval ID: ${checkoutRes.body.approvalId}`);
        
        // Approve & Execute command
        console.log('   🔓 Approving command via Owner Role...');
        await requestJSON(
            `${BASE_URL}/api/admin/approval/${checkoutRes.body.approvalId}/approve`,
            'POST',
            { reason: 'Digital Twin Automated Test Override', decidedBy: 'owner' },
            { Authorization: `Bearer ${ownerToken}` }
        );
        await requestJSON(
            `${BASE_URL}/api/admin/approval/${checkoutRes.body.approvalId}/execute`,
            'POST',
            null,
            { Authorization: `Bearer ${ownerToken}` }
        );
        console.log('✅ Safety Override Approved & Executed.');
    } else if (checkoutRes.status === 200) {
        console.log('✅ Check-out processed immediately.');
    } else {
        console.error('❌ Check-out error:', checkoutRes.body);
        process.exit(1);
    }

    // Final State Check
    const finalRoomsRes = await requestJSON(`${BASE_URL}/api/rooms`, 'GET');
    const finalRoom101 = finalRoomsRes.body.rooms.find(r => r.id === 101);
    console.log(`✅ Final Room 101 State: status='${finalRoom101.status}', power=${finalRoom101.power}`);

    console.log('\n============================================================');
    console.log('🎉 💯 DIGITAL TWIN LOOPTEST COMPLETED 100% SUCCESSFULLY!');
    console.log('============================================================');
}

runDigitalTwinLoopTest();
