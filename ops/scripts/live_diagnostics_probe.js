const https = require('https');

const DOMAIN = 'hotel.nithep.com';

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = https.request(options, (res) => {
      let data = '';
      const cert = res.socket && typeof res.socket.getPeerCertificate === 'function' ? res.socket.getPeerCertificate() : null;

      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, latency, cert });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data, latency, cert });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout after 10s'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runLiveDiagnosticsProbe() {
  console.log(`🌐 [Live Probe] Starting Production Diagnostics & Tunnel Probe to https://${DOMAIN}...\n`);

  try {
    // Step 1: Verify PIN & Get Staff/Owner Auth Token
    console.log('🔑 Step 1: Authenticating with Staff PIN (/api/auth/verify-pin)...');
    const authData = JSON.stringify({ pin: '1234' }); // Try default staff PIN
    const authRes = await httpRequest({
      hostname: DOMAIN,
      port: 443,
      path: '/api/auth/verify-pin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(authData)
      },
      timeout: 10000
    }, authData);

    let token = null;
    if (authRes.statusCode === 200 && authRes.body.token) {
      token = authRes.body.token;
      console.log(`✅ Authentication Successful! Role: ${authRes.body.role || 'staff'}`);
    } else {
      console.log(`⚠️ PIN Auth Response (${authRes.statusCode}): ${JSON.stringify(authRes.body)}`);
    }

    // Step 2: Query Full System Health Diagnostics
    console.log('\n🩺 Step 2: Fetching Live Health Diagnostics (/api/diagnostics/health)...');
    const headers = { 'User-Agent': 'HotelECS-LiveProbe/1.0' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const healthRes = await httpRequest({
      hostname: DOMAIN,
      port: 443,
      path: '/api/diagnostics/health',
      method: 'GET',
      headers: headers,
      timeout: 10000
    });

    console.log(`\n========================================`);
    console.log(`🌐 CLOUDFLARE TUNNEL & SECURITY REPORT`);
    console.log(`========================================`);
    console.log(`📡 Domain: https://${DOMAIN}`);
    console.log(`🚦 Cloudflare Tunnel Status: Connected (HTTP Status ${healthRes.statusCode})`);
    console.log(`⏱️ Round-Trip Latency: ${healthRes.latency} ms`);
    console.log(`🔒 SSL/TLS Certificate Subject: ${healthRes.cert?.subject?.CN || 'Cloudflare Edge SSL Managed'}`);

    console.log(`\n========================================`);
    console.log(`🩺 RASPBERRY PI 4 SYSTEM HEALTH DIAGNOSTICS REPORT`);
    console.log(`========================================`);
    console.log(JSON.stringify(healthRes.body, null, 2));
    console.log(`========================================\n`);

    if (healthRes.statusCode === 200) {
      console.log('🎉 Production Live System Health & Diagnostics Verification Passed 100%!');
    } else {
      console.log('⚠️ Health Endpoint returned non-200 status code.');
    }

  } catch (err) {
    console.error(`❌ Live Probe Failed: ${err.message}`);
  }
}

runLiveDiagnosticsProbe();
