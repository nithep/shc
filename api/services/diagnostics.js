const os = require('os');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const net = require('net');

/**
 * Perform low-level diagnostics checks on the local Raspberry Pi.
 * @param {object} db - Database wrapper from db.js
 * @param {object} pbx - PBX connector instance
 * @returns {Promise<object>}
 */
async function runDiagnostics(db, pbx) {
    const report = {
        timestamp: new Date().toISOString(),
        pbx: { status: 'red', mode: 'mock', state: 'UNKNOWN', isReady: false, details: '' },
        network: { status: 'red', ipAddress: '0.0.0.0', dnsResolve: 'fail', internet: 'fail', details: '' },
        database: { status: 'red', path: '', sizeBytes: 0, details: '' },
        system: { status: 'green', cpu: 0, ram: 0, uptime: 0, details: '' }
    };

    // 1. PBX Connection Check
    try {
        if (pbx) {
            report.pbx.mode = pbx.mode || 'mock';
            report.pbx.state = pbx.state || 'DISCONNECTED';
            report.pbx.isReady = !!pbx.isReady;
            
            if (pbx.mode === 'mock') {
                report.pbx.status = 'green';
                report.pbx.details = 'PBX is running in Mock Mode (Simulator).';
            } else if (pbx.isReady) {
                report.pbx.status = 'green';
                report.pbx.details = `Connected to PBX at ${pbx.host || 'unknown'}:${pbx.port || 'unknown'} via TCP.`;
            } else {
                report.pbx.status = 'red';
                report.pbx.details = `PBX connection state: ${pbx.state}. Mode: ${pbx.mode}.`;
            }
        } else {
            report.pbx.details = 'PBX Connector is not initialized.';
        }
    } catch (err) {
        report.pbx.status = 'red';
        report.pbx.details = `PBX Check failed: ${err.message}`;
    }

    // 2. Network Check (Internet, DNS & IP)
    try {
        // Get active local IPs
        const interfaces = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ips.push(`${name}: ${iface.address}`);
                }
            }
        }
        report.network.ipAddress = ips.join(', ') || '127.0.0.1';

        // Check DNS Resolution
        try {
            const dnsStart = Date.now();
            await dns.resolve('dns.google');
            report.network.dnsResolve = 'ok';
            report.network.details += `DNS resolved successfully (${Date.now() - dnsStart}ms). `;
        } catch (e) {
            report.network.dnsResolve = 'fail';
            report.network.details += 'DNS resolution failed. ';
        }

        // Test internet using direct TCP connection to Google Public DNS on Port 53 (Fast check)
        const checkInternet = () => new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('error', () => resolve(false));
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(53, '8.8.8.8');
        });

        const hasInternet = await checkInternet();
        if (hasInternet) {
            report.network.internet = 'ok';
            report.network.status = 'green';
            report.network.details += 'Internet connection is healthy (8.8.8.8:53 connected).';
        } else {
            report.network.internet = 'fail';
            report.network.status = 'red';
            report.network.details += 'No outbound Internet access (TCP port 53 test failed).';
        }
    } catch (err) {
        report.network.status = 'red';
        report.network.details = `Network Check error: ${err.message}`;
    }

    // 3. Database Check
    try {
        const dbPath = path.resolve(__dirname, '..', 'hotel.db');
        report.database.path = dbPath;

        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            report.database.sizeBytes = stats.size;

            // Run simple query to test write/read integrity
            const dbCheck = () => new Promise((resolve) => {
                db.db.get("SELECT 1 as test", (err, row) => {
                    if (err) resolve({ ok: false, msg: err.message });
                    else if (row && row.test === 1) resolve({ ok: true });
                    else resolve({ ok: false, msg: 'Invalid response from DB' });
                });
            });

            const testResult = await dbCheck();
            if (testResult.ok) {
                report.database.status = 'green';
                report.database.details = `Database OK. File size: ${(stats.size / 1024).toFixed(1)} KB.`;
            } else {
                report.database.status = 'red';
                report.database.details = `Database query failed: ${testResult.msg}`;
            }
        } else {
            report.database.status = 'red';
            report.database.details = `Database file not found at ${dbPath}`;
        }
    } catch (err) {
        report.database.status = 'red';
        report.database.details = `Database check failed: ${err.message}`;
    }

    // 4. System Metrics
    try {
        const cpuLoad = os.loadavg()[0];
        const cpus = os.cpus().length;
        const cpuPercent = Math.min((cpuLoad / cpus) * 100, 100);

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const ramPercent = ((totalMem - freeMem) / totalMem) * 100;

        report.system.cpu = parseFloat(cpuPercent.toFixed(1));
        report.system.ram = parseFloat(ramPercent.toFixed(1));
        report.system.uptime = os.uptime();
        report.system.status = (cpuPercent > 90 || ramPercent > 95) ? 'yellow' : 'green';
        report.system.details = `Uptime: ${(os.uptime() / 3600).toFixed(1)} hours. CPU: ${report.system.cpu}%, RAM: ${report.system.ram}%`;
    } catch (err) {
        report.system.status = 'red';
        report.system.details = `System check failed: ${err.message}`;
    }

    return report;
}

module.exports = {
    runDiagnostics
};
