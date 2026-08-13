/**
 * 🔒 Integration Test: Role-Based Access Control (RBAC) Verification
 * สำหรับระบบ Hotel ECS
 */

const http = require('http');
const path = require('path');
// โหลดค่า config จาก .env ของโปรเจกต์
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

const OWNER_PIN = process.env.OWNER_PIN || '9999';
const FRONTDESK_PIN = process.env.FRONTDESK_PIN || '1234';

async function postJSON(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const dataStr = JSON.stringify(body);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataStr),
                ...headers
            }
        }, (res) => {
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
        req.write(dataStr);
        req.end();
    });
}

async function getJSON(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        }, (res) => {
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
        req.end();
    });
}

async function runTests() {
    console.log('🤖 Starting RBAC Security Integration Tests...');
    console.log(`🔗 Connecting to: ${BASE_URL}`);
    console.log(`🔑 Using PINs - Owner: ${OWNER_PIN}, Staff: ${FRONTDESK_PIN}`);
    
    console.log('\n🔑 [Authentication] Fetching Tokens from PIN endpoints...');
    
    // ดึง Owner Token
    const ownerAuth = await postJSON(`${BASE_URL}/api/auth/verify-pin`, { pin: OWNER_PIN });
    if (ownerAuth.status !== 200) {
        console.error('❌ Failed to authenticate Owner PIN:', ownerAuth.body);
        process.exit(1);
    }
    const ownerToken = ownerAuth.body.token;
    console.log('✅ Owner token retrieved. Role:', ownerAuth.body.role);
    
    // ดึง Staff Token
    const staffAuth = await postJSON(`${BASE_URL}/api/auth/verify-pin`, { pin: FRONTDESK_PIN });
    if (staffAuth.status !== 200) {
        console.error('❌ Failed to authenticate Staff PIN:', staffAuth.body);
        process.exit(1);
    }
    const staffToken = staffAuth.body.token;
    console.log('✅ Staff token retrieved. Role:', staffAuth.body.role);

    // ดึง Guest Token จากการจำลอง Check-in (ห้อง 101)
    console.log('⏳ Attempting test check-in for Room 101...');
    const checkinRes = await postJSON(`${BASE_URL}/api/checkin`, {
        roomNumber: '101',
        guestName: 'Somchai Test',
        guestEmail: 'somchai@test.com',
        pdpaConsent: true
    }, { 'Authorization': `Bearer ${staffToken}` }); // ส่ง Staff token เพื่อผ่านด่าน
    
    if (checkinRes.status >= 300 || !checkinRes.body || !checkinRes.body.token) {
        console.error('❌ Check-in failed or returned no token. Status:', checkinRes.status, 'Body:', checkinRes.body);
        process.exit(1);
    }
    const guestToken = checkinRes.body.token;
    console.log('✅ Guest token retrieved for Room 101.');

    let failedTests = 0;
    
    const assertStatus = (name, res, expectedStatus) => {
        if (res.status === expectedStatus) {
            console.log(`  🟢 ${name}: PASS (Received ${res.status})`);
        } else {
            console.error(`  🔴 ${name}: FAIL (Expected ${expectedStatus}, Received ${res.status})`);
            console.error('     Response Body:', res.body);
            failedTests++;
        }
    };

    // 2. ทดสอบความปลอดภัยของ Endpoints
    console.log('\n🔒 [Tests] Verifying Endpoint Permissions...');

    // --- ตรวจสอบ API Keys (สิทธิ์: Owner เท่านั้น) ---
    console.log('\n📌 Testing: GET /api/admin/apikeys');
    const apiKeysNoToken = await getJSON(`${BASE_URL}/api/admin/apikeys`);
    assertStatus('No token access (API Keys)', apiKeysNoToken, 401);

    const apiKeysGuest = await getJSON(`${BASE_URL}/api/admin/apikeys`, { 'Authorization': `Bearer ${guestToken}` });
    assertStatus('Guest token access (API Keys)', apiKeysGuest, 403);

    const apiKeysStaff = await getJSON(`${BASE_URL}/api/admin/apikeys`, { 'Authorization': `Bearer ${staffToken}` });
    assertStatus('Staff token access (API Keys)', apiKeysStaff, 403);

    const apiKeysOwner = await getJSON(`${BASE_URL}/api/admin/apikeys`, { 'Authorization': `Bearer ${ownerToken}` });
    assertStatus('Owner token access (API Keys)', apiKeysOwner, 200);

    // --- ตรวจสอบ Approvals (สิทธิ์: Staff & Owner) ---
    console.log('\n📌 Testing: GET /api/admin/approval');
    const appNoToken = await getJSON(`${BASE_URL}/api/admin/approval`);
    assertStatus('No token access (Approvals)', appNoToken, 401);

    const appGuest = await getJSON(`${BASE_URL}/api/admin/approval`, { 'Authorization': `Bearer ${guestToken}` });
    assertStatus('Guest token access (Approvals)', appGuest, 403);

    const appStaff = await getJSON(`${BASE_URL}/api/admin/approval`, { 'Authorization': `Bearer ${staffToken}` });
    assertStatus('Staff token access (Approvals)', appStaff, 200);

    const appOwner = await getJSON(`${BASE_URL}/api/admin/approval`, { 'Authorization': `Bearer ${ownerToken}` });
    assertStatus('Owner token access (Approvals)', appOwner, 200);

    // --- ตรวจสอบ Wi-Fi Settings (สิทธิ์: Owner เท่านั้น) ---
    console.log('\n📌 Testing: GET /api/wifi/status');
    const wifiNoToken = await getJSON(`${BASE_URL}/api/wifi/status`);
    assertStatus('No token access (Wifi Status)', wifiNoToken, 401);

    const wifiStaff = await getJSON(`${BASE_URL}/api/wifi/status`, { 'Authorization': `Bearer ${staffToken}` });
    assertStatus('Staff token access (Wifi Status)', wifiStaff, 403);

    const wifiOwner = await getJSON(`${BASE_URL}/api/wifi/status`, { 'Authorization': `Bearer ${ownerToken}` });
    assertStatus('Owner token access (Wifi Status)', wifiOwner, 200);

    // --- ตรวจสอบ Guest-Control (สิทธิ์: Guest ที่เป็นเจ้าของห้องเท่านั้น) ---
    console.log('\n📌 Testing: POST /api/rooms/guest-control');
    const guestControlNoToken = await postJSON(`${BASE_URL}/api/rooms/guest-control`, { action: 'ON' });
    assertStatus('No token access (Guest Control)', guestControlNoToken, 401);

    const guestControlStaff = await postJSON(`${BASE_URL}/api/rooms/guest-control`, { action: 'ON' }, { 'Authorization': `Bearer ${staffToken}` });
    assertStatus('Staff token access (Guest Control)', guestControlStaff, 403);

    const guestControlGuest = await postJSON(`${BASE_URL}/api/rooms/guest-control`, { action: 'ON' }, { 'Authorization': `Bearer ${guestToken}` });
    assertStatus('Valid Guest token access (Guest Control)', guestControlGuest, 200);

    // --- เคลียร์ข้อมูลโดยการเช็คเอาท์ห้อง 101 ---
    console.log('\n🧹 Cleaning up test check-in for Room 101...');
    await postJSON(`${BASE_URL}/api/checkout`, { roomNumber: '101' }, { 'Authorization': `Bearer ${ownerToken}` });
    console.log('✅ Cleaned up.');

    // 3. สรุปผล
    console.log('\n🏁 --- Test Summary ---');
    if (failedTests === 0) {
        console.log('💚 ALL RBAC SECURITY INTEGRATION TESTS PASSED!');
        process.exit(0);
    } else {
        console.error(`💥 FAILED: ${failedTests} tests failed.`);
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
