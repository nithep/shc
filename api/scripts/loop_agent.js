const http = require('http');

// Configuration
const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';
const ROOMS = ['101', '102', '103', '201', '202'];
const GUESTS = ['Nithep', 'John Doe', 'Alice', 'Bob', 'Inw.©'];
const DELAY_BETWEEN_ACTIONS = 5000; // 5 seconds (simulated stay)
const ITERATIONS = 3; // Number of test cycles

// ANSI Colors for beautiful logging
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    bold: '\x1b[1m'
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function printHeader(iteration) {
    console.log(`\n${colors.bold}${colors.magenta}======================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}🚀 SIMULATION LOOP #${iteration} STARTING...${colors.reset}`);
    console.log(`${colors.bold}${colors.magenta}======================================================${colors.reset}\n`);
}

function printStep(component, action, details, color) {
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
    console.log(`${colors.reset}[${timestamp}] ${color}${colors.bold}[${component}]${colors.reset} ${action} ${colors.reset}-> ${details}`);
}

async function sendRequest(endpoint, payload) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${API_URL}/api/${endpoint}`);
        const data = JSON.stringify(payload);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const start = Date.now();
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const latency = Date.now() - start;
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json, latency });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, latency });
                }
            });
        });

        req.on('error', error => reject(error));
        req.write(data);
        req.end();
    });
}

async function simulateGuest(roomNumber, guestName) {
    console.log(`\n${colors.cyan}--- 🏨 ทดลองจำลองแขกห้อง: ${roomNumber} (ชื่อ: ${guestName}) ---${colors.reset}`);
    
    try {
        // -------------------------------------------------------------
        // STEP 1: LIFF (Frontend) -> Backend
        // -------------------------------------------------------------
        printStep('LINE-WEB', 'Guest clicked Check-in', `Room: ${roomNumber}`, colors.blue);
        printStep('FRONTEND', 'Sending API Request', `POST /api/checkin (Guest: ${guestName})`, colors.cyan);
        
        const checkinRes = await sendRequest('checkin', { roomNumber, guestName });
        
        // -------------------------------------------------------------
        // STEP 2: Backend (Pi4) -> PBX
        // -------------------------------------------------------------
        if (checkinRes.status === 200 || checkinRes.status === 202) {
            printStep('BACKEND (Pi4)', 'Approved & Routed Command', `Response Time: ${checkinRes.latency}ms`, colors.green);
            printStep('PABX', 'Hardware Relay', `Status: ON (ไฟห้อง ${roomNumber} พร้อมใช้งาน)`, colors.yellow);
        } else {
            printStep('BACKEND (Pi4)', 'Rejected Command', `Reason: ${JSON.stringify(checkinRes.data)}`, colors.red);
            return;
        }

        // -------------------------------------------------------------
        // STEP 3: Waiting (Simulate stay)
        // -------------------------------------------------------------
        printStep('GUEST', 'Staying in room', `Sleeping for ${DELAY_BETWEEN_ACTIONS/1000} seconds...`, colors.reset);
        await delay(DELAY_BETWEEN_ACTIONS);

        // -------------------------------------------------------------
        // STEP 4: LIFF (Frontend) -> Checkout
        // -------------------------------------------------------------
        printStep('LINE-WEB', 'Guest clicked Check-out', `Room: ${roomNumber}`, colors.blue);
        printStep('FRONTEND', 'Sending API Request', `POST /api/checkout`, colors.cyan);

        const checkoutRes = await sendRequest('checkout', { roomNumber });

        // -------------------------------------------------------------
        // STEP 5: Backend (Pi4) -> PBX (Off)
        // -------------------------------------------------------------
        if (checkoutRes.status === 200 || checkoutRes.status === 202) {
            printStep('BACKEND (Pi4)', 'Approved & Routed Command', `Response Time: ${checkoutRes.latency}ms`, colors.green);
            printStep('PABX', 'Hardware Relay', `Status: OFF (ไฟห้อง ${roomNumber} ถูกตัด)`, colors.red);
        } else {
            printStep('BACKEND (Pi4)', 'Rejected Command', `Reason: ${JSON.stringify(checkoutRes.data)}`, colors.red);
        }

    } catch (err) {
        printStep('SYSTEM', 'Error', err.message, colors.red);
    }
}

async function startSimulation() {
    console.clear();
    console.log(`${colors.green}${colors.bold}🤖 Hotel ECS - Progress Management (PM) Simulation Agent Started${colors.reset}`);
    console.log(`Target Backend: ${API_URL}\n`);

    for (let i = 1; i <= ITERATIONS; i++) {
        printHeader(i);
        
        // Randomly pick a room and a guest
        const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
        const guest = GUESTS[Math.floor(Math.random() * GUESTS.length)];

        await simulateGuest(room, guest);
        
        console.log(`\n${colors.cyan}Waiting 3 seconds before next cycle...${colors.reset}`);
        await delay(3000);
    }

    console.log(`\n${colors.green}${colors.bold}✅ SIMULATION COMPLETE. (Completed ${ITERATIONS} cycles)${colors.reset}\n`);
}

startSimulation();
