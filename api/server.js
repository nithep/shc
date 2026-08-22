const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const { createConnector } = require('../pbx');

// ─── Services ──────────────────────────────────────────────────────────────
const { ApprovalGate } = require('./services/approval_gate');
const { initAuditLog, appendAuditEvent, listAuditEvents } = require('./services/audit_log');
const { RateLimiter } = require('./services/rate_limiter');
const { TelegramBotService } = require('./services/telegram_bot');
const { GoogleNotifier } = require('./services/google_notifier');
const { WiFiService } = require('./services/wifi_service');
const apiKeyService = require('./services/apiKeyService');
const {
    PRIVACY_POLICY,
    validateCheckinConsent,
    buildConsentRecord,
    sanitizePublicRoom,
    sanitizeStaffRoom,
    getConsentAudit,
    initPdpaConsentTable,
    saveConsentRecord,
    withdrawConsent,
    cleanupOldConsents,
} = require('./services/pdpa_service');
const rateLimit = require('express-rate-limit');
const cronScheduler = require('./services/cron_scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ใช้ IP จริงจาก reverse proxy (Cloudflare Tunnel / nginx) สำหรับบันทึก PDPA consent
app.set('trust proxy', 1);

// ─── PBX Connector Setup ──────────────────────────────────────────────────
// PBX_MODE: 'mock' (default), 'tcp' (simulator/real PBX), 'serial' (RS-232)
const PBX_MODE = process.env.PBX_MODE || 'mock';
const pbx = createConnector({
    mode: PBX_MODE,
    host: process.env.PBX_HOST || '127.0.0.1',
    port: parseInt(process.env.PBX_PORT || '10001', 10),
    serialPath: process.env.PBX_SERIAL || '',
    baudRate: parseInt(process.env.PBX_BAUD || '9600', 10),
    heartbeatInterval: PBX_MODE === 'mock' ? 0 : 30000,
});

// Log PBX events
pbx.on('checkin', (data) => console.log(`[PBX] ✅ Check-in:`, data));
pbx.on('checkout', (data) => console.log(`[PBX] 🔴 Check-out:`, data));
pbx.on('heartbeat', () => console.log(`[PBX] 💓 Heartbeat OK`));
pbx.on('connection_lost', () => {
    console.log(`[PBX] ⚠️ Connection lost!`);
    if (telegramBot) telegramBot.sendSystemAlert('Connection Lost', 'การเชื่อมต่อกับตู้สาขา PBX ขาดหาย!');
    if (typeof googleNotifier !== 'undefined' && googleNotifier) googleNotifier.sendSystemAlert('Connection Lost', 'การเชื่อมต่อกับตู้สาขา PBX ขาดหาย!', true);
});
pbx.on('reconnecting', (d) => console.log(`[PBX] 🔄 Reconnecting (${d.attempt}/${d.maxAttempts})...`));
pbx.on('reconnected', () => {
    console.log(`[PBX] ✅ Reconnected!`);
    if (telegramBot) telegramBot.sendSystemAlert('Connection Restored', 'เชื่อมต่อกับตู้สาขา PBX สำเร็จแล้ว');
    if (typeof googleNotifier !== 'undefined' && googleNotifier) googleNotifier.sendSystemAlert('Connection Restored', 'เชื่อมต่อกับตู้สาขา PBX สำเร็จแล้ว', false);
    syncPbxStateWithDatabase();
});
pbx.on('error', (err) => {
    console.error(`[PBX] ❌ Error:`, err.message);
    if (telegramBot) telegramBot.sendSystemAlert('PBX Error', err.message);
    if (typeof googleNotifier !== 'undefined' && googleNotifier) googleNotifier.sendSystemAlert('PBX Error', err.message, true);
});

// --- Periodic Reconnection Loop (Self-Healing) ---
function scheduleReconnection() {
    console.log(`[PBX] ⏳ Scheduling automatic reconnection in 60 seconds...`);
    setTimeout(async () => {
        if (pbx.state === 'DISCONNECTED') {
            console.log(`[PBX] 🔄 Periodic Reconnection Loop: Attempting to connect again...`);
            try {
                await pbx.connect();
                console.log(`[PBX] ✅ Periodic Reconnection successful.`);
                if (telegramBot) telegramBot.sendSystemAlert('PBX Connection Restored', 'ระบบ Auto-Recovery (Self-Healing) เชื่อมต่อกับตู้สาขา PBX สำเร็จแล้ว');
                if (typeof googleNotifier !== 'undefined' && googleNotifier) googleNotifier.sendSystemAlert('PBX Connection Restored', 'ระบบ Auto-Recovery (Self-Healing) เชื่อมต่อกับตู้สาขา PBX สำเร็จแล้ว', false);
                syncPbxStateWithDatabase();
            } catch (err) {
                console.error(`[PBX] ❌ Periodic Reconnection Loop failed:`, err.message);
                scheduleReconnection(); // Retry loop
            }
        }
    }, 60000);
}

pbx.on('reconnect_failed', (d) => {
    console.error(`[PBX] ❌ Reconnect failed after ${d.maxAttempts} attempts.`);
    if (telegramBot) telegramBot.sendSystemAlert('PBX Fault Alarm', `เชื่อมต่อตู้สาขา PBX ล้มเหลวต่อเนื่อง ${d.maxAttempts} ครั้ง (Host Unreachable/Timeout) - ระบบจะพยายามเชื่อมต่อใหม่แบบวนซ้ำทุก 60 วินาทีอัตโนมัติ`);
    if (typeof googleNotifier !== 'undefined' && googleNotifier) googleNotifier.sendSystemAlert('PBX Fault Alarm', `เชื่อมต่อตู้สาขา PBX ล้มเหลวต่อเนื่อง ${d.maxAttempts} ครั้ง (Host Unreachable/Timeout) - ระบบจะพยายามเชื่อมต่อใหม่แบบวนซ้ำทุก 60 วินาทีอัตโนมัติ`, true);
    
    scheduleReconnection();
});

// Middleware
app.use(cors());
app.use(express.json());

// ─── Authentication & RBAC Middleware ──────────────────────────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_hotel_ecs_token_key_103r_v5';
const FRONTDESK_PIN = process.env.FRONTDESK_PIN || '1234';
const OWNER_PIN = process.env.OWNER_PIN || '9999';

function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token is required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error(`[JWT Verify Error] ${err.message}`);
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
}

function verifyGuestToken(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== 'guest') {
            return res.status(403).json({ error: 'Access denied: Guests only' });
        }
        req.guestRoomNumber = req.user.roomNumber;
        next();
    });
}

function verifyStaffToken(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== 'front_desk' && req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Access denied: Staff/Owner authorization required' });
        }
        next();
    });
}

function verifyOwnerToken(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== 'owner') {
            return res.status(403).json({ error: 'Access denied: Owner authorization required' });
        }
        next();
    });
}

// ─── PIN Verification API ──────────────────────────────────────────────────
app.post('/api/auth/verify-pin', (req, res) => {
    const { pin } = req.body;
    if (!pin) {
        return res.status(400).json({ error: 'PIN code is required' });
    }
    
    let role = null;
    if (pin === OWNER_PIN) {
        role = 'owner';
    } else if (pin === FRONTDESK_PIN) {
        role = 'front_desk';
    }
    
    if (!role) {
        return res.status(401).json({ error: 'Invalid PIN code' });
    }
    
    // Create JWT Token for Staff/Owner (expires in 8 hours)
    const token = jwt.sign({ role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, role });
});

const db = require('./db');

// ─── Initialize Safety Services ───────────────────────────────────────────
const gate = new ApprovalGate({
    approvalTtlMs: 60 * 1000,       // Approval หมดอายุใน 60 วินาที
    pendingTtlMs: 10 * 60 * 1000,   // Pending request หมดอายุใน 10 นาที
    enforceSchedule: process.env.ENFORCE_SCHEDULE !== 'false',
    scheduleStart: '06:00',
    scheduleEnd: '00:00',
});

const rateLimiter = new RateLimiter({
    maxCommands: 3,    // ≤ 3 cmd/min/room
    windowMs: 60000,
});

// Initialize Audit Log table
initAuditLog(db.db);
apiKeyService.initApiKeyDb();
initPdpaConsentTable(db.db).catch(err => {
    console.error('[PDPA] ⚠️ Failed to initialize PDPA table:', err.message);
});

// Schedule daily cleanup of old consent records (keep for 1 year)
const cron = require('node-cron');
cron.schedule('0 2 * * *', async () => {
    try {
        await cleanupOldConsents(db.db, 365);
    } catch (err) {
        console.error('[PDPA] Cleanup job failed:', err.message);
    }
}, 'pdpa_cleanup');

console.log('[SAFETY] ✅ Approval Gate, Audit Log, Rate Limiter, API Key DB, PDPA initialized');

// Setup Express Rate Limit for Open API
const externalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Initialize Telegram Bot Service
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let telegramBot = null;

if (TELEGRAM_BOT_TOKEN) {
    telegramBot = new TelegramBotService({
        token: TELEGRAM_BOT_TOKEN,
        chatId: TELEGRAM_CHAT_ID,
        gate,
        pbx,
        rateLimiter,
        db: db.db,
        appendAuditEvent,
    });
    telegramBot.start();
}

// Initialize Google Chat Notifier
const googleNotifier = new GoogleNotifier();
if (googleNotifier.isChatActive() || googleNotifier.isSheetsActive()) {
    console.log('[GOOGLE CHAT/SHEETS] ✅ Google Notifier initialized');
}

const wifiService = new WiFiService();

// ─── Helper: Build command object for classification ──────────────────────
function buildCommand(commandType, roomNumber, options = {}) {
    const targetRooms = roomNumber === '*'
        ? ['*']
        : Array.isArray(roomNumber) ? roomNumber.map(String) : [String(roomNumber)];

    return {
        traceId: randomUUID(),
        commandType,
        targetRooms,
        requestedBy: options.requestedBy || 'user:frontend',
        source: options.source || 'unknown',
        dryRun: options.dryRun || false,
        executionMode: PBX_MODE,
        guestName: options.guestName || null,
        metadata: {
            flow: options.flow || null,
            reason: options.reason || null,
        },
    };
}

// ─── Helper: Execute command through safety pipeline ──────────────────────
async function executeWithSafety(command, executeFn) {
    const now = new Date();

    // 1. Rate Limiter — ตรวจสอบทุกห้องที่ได้รับผลกระทบ
    for (const room of command.targetRooms) {
        if (room === '*') continue; // all-room จะถูก gate บล็อกอยู่แล้ว
        const rateResult = rateLimiter.check(room, now);
        if (!rateResult.allowed) {
            return {
                blocked: true,
                reason: 'RATE_LIMITED',
                message: `ห้อง ${room} ส่งคำสั่งเกินขีดจำกัด (${rateLimiter.maxCommands} ครั้ง/นาที)`,
                resetAt: rateResult.resetAt,
            };
        }
    }

    // 2. Approval Gate — จำแนกระดับความเสี่ยง
    const classification = gate.classify(command, now);

    if (classification.requiresApproval) {
        // High-risk: สร้าง pending approval
        const pending = gate.requestApproval(command, classification, now);

        // Log APPROVAL_REQUESTED
        await appendAuditEvent(db.db, {
            traceId: command.traceId,
            eventType: 'APPROVAL_REQUESTED',
            command: { ...command, riskCode: classification.riskCode },
        });

        // Trigger Telegram Approval Notification
        if (telegramBot) {
            telegramBot.sendApprovalRequest(pending).catch(err => {
                console.error('[TELEGRAM] Error sending approval request:', err.message);
            });
        }

        return {
            blocked: true,
            reason: 'APPROVAL_REQUIRED',
            approvalId: pending.approvalId,
            classification,
            message: `คำสั่งเสี่ยงสูง (${classification.riskCode}: ${classification.riskName}) — ต้องได้รับอนุมัติจากแอดมินก่อน`,
        };
    }

    // 3. AUTO_PASSED — คำสั่ง low-risk ผ่านอัตโนมัติ แต่ต้อง log ทุกครั้ง
    await appendAuditEvent(db.db, {
        traceId: command.traceId,
        eventType: 'AUTO_PASSED',
        command: { ...command, riskCode: null },
    });

    // 4. If dryRun, skip rate limiter record and physical execute
    if (command.dryRun) {
        return {
            blocked: false,
            dryRun: true,
            result: { success: true, status: 'DRY_RUN_PASSED', message: 'คำสั่งผ่านการตรวจสอบความปลอดภัยเรียบร้อยแล้ว (ไม่ได้ยิงจริง)' }
        };
    }

    // 5. Record ลง Rate Limiter
    for (const room of command.targetRooms) {
        if (room === '*') continue;
        rateLimiter.record(room, now);
    }

    // 6. Execute
    const result = await executeFn();
    return { blocked: false, result };
}

// ─── State Synchronization (Digital Twin Loop) ────────────────────────────
async function syncPbxStateWithDatabase() {
    console.log(`[SYNC] 🔄 Starting Digital Twin State Synchronization...`);
    return new Promise((resolve) => {
        db.getAllRooms(async (err, rooms) => {
            if (err) {
                console.error(`[SYNC] ❌ CRITICAL: Failed to get rooms from DB:`, err.message);
                if (googleNotifier) googleNotifier.sendSystemAlert('🔴 CRITICAL: Sync Failed', `Digital Twin Sync ล้มเหลว: ${err.message}`, true);
                return resolve({ success: false, error: err.message });
            }

            const syncResults = [];
            for (const room of rooms) {
                try {
                    const isOccupied = room.status === 'occupied';
                    const pbxStatus = await pbx.getRoomStatus(room.id);
                    const isPbxOn = pbxStatus.status === 'ON';
                    // [CRITICAL FIX] ตรวจสอบ power field ใน DB ด้วย ไม่ใช่แค่ status
                    const isPowerCorrect = room.power === isPbxOn;

                    if (isOccupied && !isPbxOn) {
                        // DB=occupied แต่ PBX=OFF → สั่ง Auto-ON และ update DB
                        console.log(`[SYNC] ⚠️  Room ${room.id}: DB=occupied, PBX=OFF → Auto-ON + DB update`);
                        const result = await pbx.checkIn(room.id, 'SyncRecovery');
                        if (result && result.success) {
                            // Update DB power=true ให้ตรงกับ PBX
                            db.updateRoomState(room.id, 'occupied', true, {}, (dbErr) => {
                                if (dbErr) console.error(`[SYNC] ❌ DB update power failed for room ${room.id}:`, dbErr.message);
                                else console.log(`[SYNC] ✅ Room ${room.id}: DB power updated to true (synced)`);
                            });
                            syncResults.push({ room: room.id, action: 'AUTO_ON', success: true });
                        } else {
                            console.error(`[SYNC] ❌ CRITICAL: Room ${room.id} Auto-ON failed (NACK)`);
                            if (googleNotifier) googleNotifier.sendSystemAlert('⚠️ Sync Warning', `Room ${room.id}: DB=occupied แต่ตัดไฟ/ส่งคำสั่งไม่ได้ (NACK)`, true);
                            syncResults.push({ room: room.id, action: 'AUTO_ON', success: false });
                        }
                    } else if (!isOccupied && isPbxOn) {
                        // DB=vacant แต่ PBX=ON → สั่ง Auto-OFF และ update DB
                        console.log(`[SYNC] ⚠️  Room ${room.id}: DB=vacant, PBX=ON → Auto-OFF + DB update`);
                        const result = await pbx.checkOut(room.id);
                        if (result && result.success) {
                            db.updateRoomState(room.id, 'vacant', false, {}, (dbErr) => {
                                if (dbErr) console.error(`[SYNC] ❌ DB update power failed for room ${room.id}:`, dbErr.message);
                                else console.log(`[SYNC] ✅ Room ${room.id}: DB power updated to false (synced)`);
                            });
                            syncResults.push({ room: room.id, action: 'AUTO_OFF', success: true });
                        } else {
                            console.error(`[SYNC] ❌ CRITICAL: Room ${room.id} Auto-OFF failed (NACK)`);
                            if (googleNotifier) googleNotifier.sendSystemAlert('⚠️ Sync Warning', `Room ${room.id}: DB=vacant แต่ตัดไฟไม่ได้ (NACK) - กรุณาตรวจสอบ`, true);
                            syncResults.push({ room: room.id, action: 'AUTO_OFF', success: false });
                        }
                    } else if (!isPowerCorrect) {
                        // [CRITICAL FIX] power field ใน DB ไม่ตรงกับ PBX status → ซ่อมแซม DB
                        console.log(`[SYNC] 🔧 Room ${room.id}: power field mismatch (DB=${room.power}, PBX=${isPbxOn}) → Fixing DB...`);
                        db.updateRoomState(room.id, room.status, isPbxOn, {}, (dbErr) => {
                            if (dbErr) console.error(`[SYNC] ❌ DB power fix failed for room ${room.id}:`, dbErr.message);
                            else console.log(`[SYNC] ✅ Room ${room.id}: DB power field corrected to ${isPbxOn}`);
                        });
                        syncResults.push({ room: room.id, action: 'POWER_FIX', success: true });
                    } else {
                        console.log(`[SYNC] ✅ Room ${room.id}: OK (status=${room.status}, power=${room.power}, PBX=${pbxStatus.status})`);
                        syncResults.push({ room: room.id, action: 'OK', success: true });
                    }
                } catch (syncErr) {
                    console.warn(`[SYNC] ⚠️  Skipped syncing room ${room.id}:`, syncErr.message);
                    syncResults.push({ room: room.id, action: 'SKIPPED', success: false, error: syncErr.message });
                }
            }
            const failed = syncResults.filter(r => !r.success);
            if (failed.length > 0) {
                console.error(`[SYNC] ❌ CRITICAL: ${failed.length} room(s) failed to sync:`, failed.map(r => r.room).join(', '));
            }
            console.log(`[SYNC] ✅ Synchronization Complete. Results:`, syncResults.length, `rooms checked.`);
            resolve({ success: true, results: syncResults });
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// API Routes
// ═══════════════════════════════════════════════════════════════════════════

// Get all rooms from Database (Anonymized for public / guests, full for staff)
app.get('/api/rooms', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    let userRole = 'public'; // public, guest, front_desk, owner
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.role === 'front_desk' || decoded.role === 'owner') {
                userRole = decoded.role;
            } else if (decoded.role === 'guest') {
                userRole = 'guest';
            }
        } catch (e) {
            // Invalid token - treat as public
        }
    }

    db.getAllRooms((err, rooms) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let processedRooms;
        
        if (userRole === 'owner') {
            // Owner sees full data (but still masked for privacy in lists)
            processedRooms = rooms.map(r => sanitizeStaffRoom(r));
        } else if (userRole === 'front_desk') {
            // Front desk sees masked data
            processedRooms = rooms.map(r => sanitizeStaffRoom(r));
        } else if (userRole === 'guest') {
            // Guest sees only their room with limited info + anonymized others
            const guestRoomNumber = req.user?.roomNumber;
            processedRooms = rooms.map(r => {
                if (String(r.id) === String(guestRoomNumber)) {
                    // Show own room with some details
                    return {
                        id: r.id,
                        status: r.status,
                        power: r.power,
                        checkout_date: r.checkout_date,
                        isMyRoom: true
                    };
                }
                // Other rooms are fully anonymized
                return sanitizePublicRoom(r);
            });
        } else {
            // Public sees fully anonymized data
            processedRooms = rooms.map(r => sanitizePublicRoom(r));
        }
        
        res.json({ 
            success: true, 
            rooms: processedRooms,
            role: userRole
        });
    });
});

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'hotel-ecs-api',
        uptime: Math.floor(process.uptime()),
        pbxConnected: pbx.isReady,
        timestamp: new Date().toISOString()
    });
});

// ─── Booking Management & Identity Binding ────────────────────────────────
app.get('/api/admin/bookings', verifyStaffToken, (req, res) => {
    db.getAllBookings((err, bookings) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, bookings });
    });
});

app.post('/api/admin/bookings', verifyStaffToken, (req, res) => {
    const { roomId, guestName, checkinDate, checkoutDate } = req.body;
    if (!roomId || !guestName) {
        return res.status(400).json({ error: 'roomId and guestName are required' });
    }
    
    db.createBooking({ roomId, guestName, checkinDate, checkoutDate }, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ 
            success: true, 
            bookingId: result.id, 
            bindingToken: result.bindingToken,
            message: 'Booking created successfully' 
        });
    });
});

app.get('/api/admin/bookings/:id/binding', verifyStaffToken, (req, res) => {
    const bookingId = req.params.id;
    db.getAllBookings((err, bookings) => {
        if (err) return res.status(500).json({ error: err.message });
        const booking = bookings.find(b => String(b.id) === String(bookingId));
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        
        // Construct real working URL dynamically based on Request Host / Domain or LIFF App URL
        let bindingUrl;
        if (process.env.LIFF_APP_URL && !process.env.LIFF_APP_URL.includes('your-liff-id')) {
            bindingUrl = `${process.env.LIFF_APP_URL}?binding_token=${booking.binding_token}`;
        } else {
            const host = req.get('host') || '192.168.1.94:3000';
            const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
            const baseUrl = process.env.PUBLIC_URL || `${protocol}://${host}`;
            bindingUrl = `${baseUrl}/bind?binding_token=${booking.binding_token}`;
        }
        
        res.json({
            success: true,
            bindingToken: booking.binding_token,
            bindingUrl: bindingUrl,
            status: booking.status
        });
    });
});

app.patch('/api/admin/bookings/:id/cancel', verifyStaffToken, (req, res) => {
    const bookingId = req.params.id;
    db.cancelBooking(bookingId, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.changes === 0) return res.status(400).json({ error: 'Cannot cancel: booking not found or already bound/cancelled' });
        res.json({ success: true, message: 'Booking cancelled successfully' });
    });
});

app.delete('/api/admin/bookings/:id', verifyStaffToken, (req, res) => {
    const bookingId = req.params.id;
    db.deleteBooking(bookingId, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.changes === 0) return res.status(400).json({ error: 'Cannot delete: booking not found or is currently bound (active)' });
        res.json({ success: true, message: 'Booking deleted successfully' });
    });
});

app.get('/api/bookings/info', (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token is required' });

    db.getBookingByToken(token, (err, booking) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!booking) return res.status(404).json({ error: 'Invalid or expired binding token' });
        
        res.json({
            success: true,
            roomNumber: booking.room_id,
            guestName: booking.guest_name,
            checkinDate: booking.checkin_date,
            checkoutDate: booking.checkout_date,
            status: booking.status
        });
    });
});

app.post('/api/bookings/bind', (req, res) => {
    const { bindingToken, lineId, sessionId } = req.body;
    if (!bindingToken) return res.status(400).json({ error: 'bindingToken is required' });
    if (!lineId && !sessionId) return res.status(400).json({ error: 'lineId or sessionId is required' });

    db.getBookingByToken(bindingToken, (err, booking) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!booking) return res.status(404).json({ error: 'Invalid or expired binding token' });
        if (booking.status !== 'pending_binding') return res.status(400).json({ error: 'Booking is already bound' });

        const identity = lineId ? { type: 'line', value: lineId } : { type: 'session', value: sessionId };
        
        db.bindBooking(booking.id, identity, async (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Execute hardware checkin & turn on room power
            try {
                if (pbx) {
                    await pbx.checkIn(booking.room_id, booking.guest_name);
                }
            } catch (pbxErr) {
                console.error(`[PBX] Failed checkIn during binding for room ${booking.room_id}:`, pbxErr.message);
            }

            // Sync with DB room state
            db.updateRoomState(booking.room_id, 'occupied', true, { guestName: booking.guest_name }, (roomErr) => {
                if (roomErr) console.error(`[DB] Failed to update room ${booking.room_id} state on bind:`, roomErr.message);
                
                res.json({ 
                    success: true, 
                    message: 'Identity bound and room power activated successfully',
                    roomId: booking.room_id
                });
            });
        });
    });
});

// ─── Check-in (ผ่าน Safety Pipeline) ──────────────────────────────────────
app.post('/api/checkin', async (req, res) => {
    const { roomNumber, guestName, guestEmail, dryRun, dry_run, days, pdpaConsent } = req.body;
    
    if (!roomNumber) {
        return res.status(400).json({ error: 'roomNumber is required' });
    }

    if (!dryRun && !dry_run) {
        // Validate PDPA consent for production check-in
        if (!pdpaConsent) {
            return res.status(403).json({ 
                error: 'PDPA Consent is required for check-in',
                privacyPolicyUrl: '/api/pdpa/privacy-policy'
            });
        }

        // Build consent validation object
        const consentValidationData = {
            privacyPolicyAccepted: pdpaConsent.privacyPolicyAccepted || pdpaConsent === true,
            acceptedAt: pdpaConsent.acceptedAt ? new Date(pdpaConsent.acceptedAt) : new Date()
        };

        // Validate consent
        const validation = validateCheckinConsent(consentValidationData);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Invalid PDPA consent',
                details: validation.errors,
                privacyPolicyUrl: '/api/pdpa/privacy-policy'
            });
        }
    }

    console.log(`[API] Received Check-in Request for Room: ${roomNumber} (Dry-run: ${Boolean(dryRun || dry_run)})`);

    const command = buildCommand('ROOM_ON', roomNumber, {
        source: 'checkin_flow',
        flow: 'checkin',
        guestName,
        dryRun: Boolean(dryRun || dry_run),
    });

    try {
        const safetyResult = await executeWithSafety(command, async () => {
            const numDays = days ? parseInt(days, 10) : 1;
            const hardwareResult = await pbx.checkIn(roomNumber, guestName, numDays);
            return hardwareResult;
        });

        if (safetyResult.blocked) {
            const statusCode = safetyResult.reason === 'RATE_LIMITED' ? 429 : 202;
            return res.status(statusCode).json(safetyResult);
        }

        // Calculate checkout date
        const numDays = days ? parseInt(days, 10) : 1;
        const now = new Date();
        const checkoutDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + numDays, 12, 0, 0);

        // Generate Guest Token (JWT)
        const guestToken = jwt.sign(
            { role: 'guest', roomNumber: String(roomNumber) },
            JWT_SECRET,
            { expiresIn: Math.max(60, Math.floor((checkoutDateTime.getTime() - Date.now()) / 1000)) + 's' }
        );

        if (safetyResult.dryRun) {
            return res.json({
                message: 'Check-in (Dry-run) successful',
                trace_id: command.traceId,
                hardware_status: safetyResult.result,
                token: guestToken,
                checkoutDate: checkoutDateTime.toISOString()
            });
        }

        // Save PDPA consent record first
        let consentHash = null;
        if (pdpaConsent) {
            try {
                const consentRecord = buildConsentRecord({
                    guestName,
                    guestEmail,
                    roomNumber,
                    ipAddress: req.ip,
                    acceptedAt: pdpaConsent.acceptedAt ? new Date(pdpaConsent.acceptedAt) : new Date()
                });
                
                const savedConsent = await saveConsentRecord(db.db, consentRecord);
                consentHash = savedConsent.consentHash;
                console.log(`[PDPA] ✅ Consent saved for room ${roomNumber}: ${consentHash}`);
            } catch (consentErr) {
                console.error('[PDPA] ⚠️ Failed to save consent:', consentErr.message);
                // Continue with check-in even if consent save fails (log error but don't block)
            }
        }

        // Persist to Database
        const dbOptions = {
            guestName,
            guestEmail,
            consentGivenAt: pdpaConsent ? new Date().toISOString() : null,
            consentIp: req.ip,
            consentHash,
            checkoutDate: checkoutDateTime.toISOString()
        };
        
        db.updateRoomState(roomNumber, 'occupied', true, dbOptions, async (err) => {
            if (err) {
                console.error('[DB] Check-in database update failed:', err.message);
                return res.status(500).json({ error: 'Database update failed' });
            }
            
            // Notify Front Desk via Google Chat (and trigger email via Sheets Webhook)
            googleNotifier.sendCheckinAlert({ roomNumber, guestName, guestEmail });

            // Log PDPA compliance event
            if (consentHash) {
                await appendAuditEvent(db.db, {
                    traceId: command.traceId,
                    eventType: 'PDPA_CONSENT_RECORDED',
                    command: { ...command, consentHash },
                    pdpa: {
                        guestName,
                        roomNumber,
                        consentHash,
                        ipAddress: req.ip
                    }
                }).catch(e => console.error('[AUDIT] Failed to log PDPA event:', e.message));
            }

            res.json({
                success: true,
                message: 'Check-in successful',
                trace_id: command.traceId,
                hardware_status: safetyResult.result,
                token: guestToken,
                checkoutDate: checkoutDateTime.toISOString(),
                pdpaCompliant: !!consentHash
            });
        });
    } catch (err) {
        console.error(`[API] Check-in failed for Room ${roomNumber}:`, err.message);
        res.status(500).json({ error: `PBX command failed: ${err.message}` });
    }
});

// ─── Extend Stay ──────────────────────────────────────────────────────────
app.post('/api/rooms/:id/extend', verifyStaffToken, async (req, res) => {
    const roomId = req.params.id;
    const { days = 1 } = req.body;
    
    db.getAllRooms((err, rooms) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        const room = rooms.find(r => r.id == roomId);
        if (!room || room.status !== 'occupied') {
            return res.status(400).json({ error: 'Room is not occupied' });
        }
        
        const currentCheckout = room.checkout_date ? new Date(room.checkout_date) : new Date();
        // Add days to the current checkout date
        currentCheckout.setDate(currentCheckout.getDate() + parseInt(days, 10));
        // Ensure time is 12:00 PM
        currentCheckout.setHours(12, 0, 0, 0);
        
        db.extendRoomStay(roomId, currentCheckout.toISOString(), (extErr) => {
            if (extErr) return res.status(500).json({ error: 'Failed to update checkout date' });
            
            console.log(`[API] Room ${roomId} stay extended to ${currentCheckout.toISOString()}`);
            res.json({ success: true, message: 'Stay extended successfully', newCheckoutDate: currentCheckout.toISOString() });
        });
    });
});

// ─── Check-out (ผ่าน Safety Pipeline) ─────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
    const { roomNumber, dryRun, dry_run } = req.body;
    
    if (!roomNumber) {
        return res.status(400).json({ error: 'roomNumber is required' });
    }

    // ─── Auth Verification for Checkout ───
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token is required for check-out' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Allow if staff/owner OR if matching Guest token
        const isStaff = decoded.role === 'front_desk' || decoded.role === 'owner';
        const isMatchingGuest = decoded.role === 'guest' && String(decoded.roomNumber) === String(roomNumber);
        
        if (!isStaff && !isMatchingGuest) {
            return res.status(403).json({ error: 'Access denied: Unauthorized to check-out this room' });
        }
        req.user = decoded;
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token for check-out' });
    }

    console.log(`[API] Received Check-out Request for Room: ${roomNumber} (Dry-run: ${Boolean(dryRun || dry_run)})`);

    const command = buildCommand('ROOM_OFF', roomNumber, {
        source: req.user.role === 'guest' ? 'guest_portal' : 'checkout_flow',
        flow: 'checkout',
        requestedBy: req.user.role === 'guest' ? `guest:room_${roomNumber}` : `staff:${req.user.role}`,
        dryRun: Boolean(dryRun || dry_run),
    });

    try {
        const safetyResult = await executeWithSafety(command, async () => {
            const hardwareResult = await pbx.checkOut(roomNumber);
            return hardwareResult;
        });

        if (safetyResult.blocked) {
            const statusCode = safetyResult.reason === 'RATE_LIMITED' ? 429 : 202;
            return res.status(statusCode).json(safetyResult);
        }

        if (safetyResult.dryRun) {
            return res.json({
                message: 'Check-out (Dry-run) successful',
                trace_id: command.traceId,
                hardware_status: safetyResult.result,
            });
        }

        // Persist to Database
        db.updateRoomState(roomNumber, 'vacant', false, (err) => {
            if (err) return res.status(500).json({ error: 'Database update failed' });
            
            // Notify Front Desk via Google Chat
            googleNotifier.sendCheckoutAlert({ roomNumber });

            res.json({
                message: 'Check-out successful',
                trace_id: command.traceId,
                hardware_status: safetyResult.result,
            });
        });
    } catch (err) {
        console.error(`[API] Check-out failed for Room ${roomNumber}:`, err.message);
        res.status(500).json({ error: `PBX command failed: ${err.message}` });
    }
});

// ─── Guest Control API (Token-Protected for single room) ───────────────────
app.post('/api/rooms/guest-control', verifyGuestToken, async (req, res) => {
    const { action } = req.body;
    const roomNumber = req.guestRoomNumber;
    
    if (!action) {
        return res.status(400).json({ error: 'action (ON/OFF) is required' });
    }
    
    const commandType = action.toUpperCase() === 'ON' ? 'ROOM_ON' : 'ROOM_OFF';
    console.log(`[API] [Guest Control] Room: ${roomNumber} -> ${action} (Verified by Guest JWT)`);
    
    const command = buildCommand(commandType, roomNumber, {
        source: 'guest_portal',
        flow: 'guest_control',
        requestedBy: `guest:room_${roomNumber}`
    });
    
    try {
        const safetyResult = await executeWithSafety(command, async () => {
            if (commandType === 'ROOM_ON') {
                return await pbx.checkIn(roomNumber, 'Guest ON');
            } else {
                return await pbx.checkOut(roomNumber);
            }
        });
        
        if (safetyResult.blocked) {
            const statusCode = safetyResult.reason === 'RATE_LIMITED' ? 429 : 202;
            return res.status(statusCode).json(safetyResult);
        }
        
        // Update Database state
        const dbStatus = commandType === 'ROOM_ON' ? 'occupied' : 'vacant';
        const isOccupied = commandType === 'ROOM_ON';
        
        db.updateRoomState(roomNumber, dbStatus, isOccupied, (err) => {
            if (err) return res.status(500).json({ error: 'Database update failed' });
            
            // Notify Google Chat
            googleNotifier.sendSystemAlert(
                `⚡ Guest Control Command`,
                `แขกห้อง <b>${roomNumber}</b> สั่ง <b>${action}</b> ไฟฟ้าในห้องของตนเอง<br>สถานะ PBX: ACK (สำเร็จ)`,
                false
            );
            
            res.json({
                success: true,
                message: `Command ${action} successful`,
                hardware_status: safetyResult.result
            });
        });
    } catch (err) {
        console.error(`[API] Guest control failed for Room ${roomNumber}:`, err.message);
        res.status(500).json({ error: `Command failed: ${err.message}` });
    }
});

// Get room status directly from PBX
app.get('/api/rooms/:id/status', verifyStaffToken, async (req, res) => {
    try {
        const status = await pbx.getRoomStatus(req.params.id);
        res.json({ success: true, ...status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Control Webhook (สำหรับ AppSheet / แอดมินบังคับเปิด-ปิด) ─────────────
app.post('/api/rooms/control', verifyStaffToken, async (req, res) => {
    const { roomNumber, action, source, dryRun } = req.body;
    
    if (!roomNumber || !action) {
        return res.status(400).json({ error: 'roomNumber and action (ON/OFF) are required' });
    }

    const commandType = action.toUpperCase() === 'ON' ? 'ROOM_ON' : 'ROOM_OFF';
    const reqSource = source || 'appsheet_webhook';

    console.log(`[API] Received Control Webhook for Room: ${roomNumber} -> ${action} (Source: ${reqSource})`);

    const command = buildCommand(commandType, roomNumber, {
        source: reqSource,
        flow: 'force_control',
        dryRun: Boolean(dryRun),
    });

    try {
        const safetyResult = await executeWithSafety(command, async () => {
            if (commandType === 'ROOM_ON') {
                return await pbx.checkIn(roomNumber, 'Force ON');
            } else {
                return await pbx.checkOut(roomNumber);
            }
        });

        if (safetyResult.blocked) {
            const statusCode = safetyResult.reason === 'RATE_LIMITED' ? 429 : 202;
            return res.status(statusCode).json(safetyResult);
        }

        if (safetyResult.dryRun) {
            return res.json({
                message: `Control (Dry-run) successful -> ${action}`,
                trace_id: command.traceId,
                hardware_status: safetyResult.result,
            });
        }

        // Persist to Database
        const dbStatus = commandType === 'ROOM_ON' ? 'occupied' : 'vacant';
        const isOccupied = commandType === 'ROOM_ON';
        
        db.updateRoomState(roomNumber, dbStatus, isOccupied, (err) => {
            if (err) return res.status(500).json({ error: 'Database update failed' });
            
            // Notify via Google Chat
            if (commandType === 'ROOM_ON') {
                googleNotifier.sendCheckinAlert({ roomNumber, guestName: 'Force ON (AppSheet)' });
            } else {
                googleNotifier.sendCheckoutAlert({ roomNumber });
            }

            res.json({
                success: true,
                message: `Force ${action} successful`,
                trace_id: command.traceId,
                hardware_status: safetyResult.result,
            });
        });
    } catch (err) {
        console.error(`[API] Control failed for Room ${roomNumber}:`, err.message);
        res.status(500).json({ error: `PBX command failed: ${err.message}` });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// External / Open API Routes (สำหรับ 3rd Party PMS)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/v1/external/checkin', externalApiLimiter, (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ 
            error: 'API Key is required',
            documentation: 'Please contact admin to get your API key'
        });
    }

    apiKeyService.validateApiKey(apiKey, async (err, isValid) => {
        if (err || !isValid) {
            console.warn(`[OPEN-API] Invalid API key attempt: ${apiKey?.substring(0, 8)}...`);
            return res.status(403).json({ 
                error: 'Invalid or revoked API Key',
                message: 'Your API key may have been revoked. Please contact admin.'
            });
        }

        const { roomNumber, guestName, guestEmail, dryRun, pdpaConsentHandled } = req.body;
        if (!roomNumber) {
            return res.status(400).json({ error: 'roomNumber is required' });
        }

        // For external APIs, we assume the 3rd party handles PDPA consent
        // but they must declare that they've handled it
        if (!dryRun && !pdpaConsentHandled) {
            return res.status(400).json({
                error: 'External API must confirm PDPA consent has been obtained from guest',
                solution: 'Set pdpaConsentHandled: true in request body to confirm you have obtained proper consent'
            });
        }

        console.log(`[OPEN-API] Check-in request for Room: ${roomNumber} via API Key (${apiKey?.substring(0, 8)}...)`);

        const command = buildCommand('ROOM_ON', roomNumber, {
            source: 'external_api',
            flow: 'checkin',
            guestName,
            dryRun: Boolean(dryRun),
        });

        try {
            const safetyResult = await executeWithSafety(command, async () => {
                return await pbx.checkIn(roomNumber, guestName);
            });

            if (safetyResult.blocked) {
                const statusCode = safetyResult.reason === 'RATE_LIMITED' ? 429 : 202;
                return res.status(statusCode).json(safetyResult);
            }

            if (safetyResult.dryRun) {
                return res.json({
                    message: 'External Check-in (Dry-run) successful',
                    trace_id: command.traceId,
                    hardware_status: safetyResult.result,
                });
            }

            // For external checkin, PDPA is handled by 3rd party (they confirmed via pdpaConsentHandled)
            // We still record that consent was handled externally
            const dbOptions = { 
                guestName, 
                guestEmail,
                consentGivenAt: new Date().toISOString(),
                consentIp: 'EXTERNAL_API',
                consentSource: 'external_pms'
            };

            db.updateRoomState(roomNumber, 'occupied', true, dbOptions, (err) => {
                if (err) {
                    console.error('[DB] External check-in DB update failed:', err.message);
                    return res.status(500).json({ error: 'Database update failed' });
                }
                
                googleNotifier.sendCheckinAlert({ 
                    roomNumber, 
                    guestName: guestName || 'External API',
                    guestEmail,
                    source: 'External PMS'
                });

                // Log external API usage
                appendAuditEvent(db.db, {
                    traceId: command.traceId,
                    eventType: 'EXTERNAL_API_CHECKIN',
                    command: { ...command, apiKeyPrefix: apiKey?.substring(0, 8) },
                    pdpa: { handledExternally: true }
                }).catch(e => console.error('[AUDIT] Failed to log external API event:', e.message));

                res.json({
                    success: true,
                    message: 'External Check-in successful',
                    trace_id: command.traceId,
                    hardware_status: safetyResult.result,
                });
            });
        } catch (err) {
            console.error(`[OPEN-API] Check-in failed:`, err.message);
            res.status(500).json({ error: `Command failed: ${err.message}` });
        }
    });
});

// External checkout endpoint
app.post('/api/v1/external/checkout', externalApiLimiter, (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ error: 'API Key is required' });
    }

    apiKeyService.validateApiKey(apiKey, async (err, isValid) => {
        if (err || !isValid) {
            return res.status(403).json({ error: 'Invalid or revoked API Key' });
        }

        const { roomNumber, dryRun } = req.body;
        if (!roomNumber) {
            return res.status(400).json({ error: 'roomNumber is required' });
        }

        console.log(`[OPEN-API] Checkout request for Room: ${roomNumber} via API Key`);

        const command = buildCommand('ROOM_OFF', roomNumber, {
            source: 'external_api',
            flow: 'checkout',
            dryRun: Boolean(dryRun),
        });

        try {
            const safetyResult = await executeWithSafety(command, async () => {
                return await pbx.checkOut(roomNumber);
            });

            if (safetyResult.blocked) {
                const statusCode = safetyResult.reason === 'RATE_LIMITED' ? 429 : 202;
                return res.status(statusCode).json(safetyResult);
            }

            if (safetyResult.dryRun) {
                return res.json({
                    message: 'External Checkout (Dry-run) successful',
                    trace_id: command.traceId,
                    hardware_status: safetyResult.result,
                });
            }

            db.updateRoomState(roomNumber, 'vacant', false, (err) => {
                if (err) return res.status(500).json({ error: 'Database update failed' });
                
                googleNotifier.sendCheckoutAlert({ roomNumber, source: 'External PMS' });

                appendAuditEvent(db.db, {
                    traceId: command.traceId,
                    eventType: 'EXTERNAL_API_CHECKOUT',
                    command: { ...command, apiKeyPrefix: apiKey?.substring(0, 8) }
                }).catch(e => console.error('[AUDIT] Failed to log external API event:', e.message));

                res.json({
                    success: true,
                    message: 'External Checkout successful',
                    trace_id: command.traceId,
                    hardware_status: safetyResult.result,
                });
            });
        } catch (err) {
            console.error(`[OPEN-API] Checkout failed:`, err.message);
            res.status(500).json({ error: `Command failed: ${err.message}` });
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// PDPA Compliance Routes (/api/pdpa)
// ═══════════════════════════════════════════════════════════════════════════

// Get Privacy Policy
app.get('/api/pdpa/privacy-policy', (req, res) => {
    res.json({
        success: true,
        policy: PRIVACY_POLICY,
        version: '1.0',
        lastUpdated: '2025-01-01'
    });
});

// Submit consent for check-in
app.post('/api/pdpa/consent', async (req, res) => {
    const { guestName, guestEmail, roomNumber, privacyPolicyAccepted, acceptedAt } = req.body;

    // Validate required fields
    if (!guestName || !roomNumber) {
        return res.status(400).json({ error: 'guestName and roomNumber are required' });
    }

    // Build consent data object
    const consentData = {
        privacyPolicyAccepted,
        acceptedAt: acceptedAt ? new Date(acceptedAt) : new Date()
    };

    // Validate consent
    const validation = validateCheckinConsent(consentData);
    if (!validation.valid) {
        return res.status(400).json({
            error: 'Invalid consent',
            details: validation.errors
        });
    }

    try {
        // Build consent record
        const consentRecord = buildConsentRecord({
            guestName,
            guestEmail,
            roomNumber,
            ipAddress: req.ip,
            acceptedAt: consentData.acceptedAt
        });

        // Save to database
        const savedRecord = await saveConsentRecord(db.db, consentRecord);

        console.log(`[PDPA] ✅ Consent recorded for room ${roomNumber} by ${guestName}`);

        res.json({
            success: true,
            message: 'Consent recorded successfully',
            consentHash: savedRecord.consentHash,
            acceptedAt: savedRecord.acceptedAt
        });
    } catch (err) {
        console.error('[PDPA] Failed to record consent:', err.message);
        res.status(500).json({ error: 'Failed to record consent' });
    }
});

// Withdraw consent (Guest or Owner only)
app.post('/api/pdpa/withdraw', verifyOwnerToken, async (req, res) => {
    const { consentHash, reason } = req.body;

    if (!consentHash) {
        return res.status(400).json({ error: 'consentHash is required' });
    }

    try {
        const withdrawn = await withdrawConsent(db.db, consentHash, reason);

        if (!withdrawn) {
            return res.status(404).json({ error: 'Consent record not found or already withdrawn' });
        }

        console.log(`[PDPA] ✅ Consent withdrawn: ${consentHash}`);

        res.json({
            success: true,
            message: 'Consent withdrawn successfully'
        });
    } catch (err) {
        console.error('[PDPA] Failed to withdraw consent:', err.message);
        res.status(500).json({ error: 'Failed to withdraw consent' });
    }
});

// Get consent audit trail (Owner only)
app.get('/api/pdpa/audit', verifyOwnerToken, async (req, res) => {
    try {
        const records = await getConsentAudit(db.db, {
            roomNumber: req.query.room_number,
            guestName: req.query.guest_name,
            consentHash: req.query.consent_hash,
            limit: parseInt(req.query.limit) || 100
        });

        res.json({
            success: true,
            count: records.length,
            records
        });
    } catch (err) {
        console.error('[PDPA] Failed to fetch consent audit:', err.message);
        res.status(500).json({ error: 'Failed to fetch consent audit' });
    }
});

// Data Subject Access Request (DSAR) - Get all personal data for a guest
app.get('/api/pdpa/data-access', verifyOwnerToken, async (req, res) => {
    const { guestName, roomNumber } = req.query;

    if (!guestName && !roomNumber) {
        return res.status(400).json({ error: 'Either guestName or roomNumber is required' });
    }

    try {
        // Get consent records
        const consentRecords = await getConsentAudit(db.db, {
            guestName,
            roomNumber,
            limit: 1000
        });

        // Get room history from main database
        const roomHistory = await new Promise((resolve, reject) => {
            let query = 'SELECT * FROM rooms WHERE 1=1';
            const params = [];

            if (roomNumber) {
                query += ' AND id = ?';
                params.push(String(roomNumber));
            }

            if (guestName) {
                query += ' AND guest_name LIKE ?';
                params.push(`%${guestName}%`);
            }

            db.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        res.json({
            success: true,
            dataSubject: {
                guestName,
                roomNumber
            },
            consentRecords,
            roomHistory,
            totalRecords: consentRecords.length + roomHistory.length,
            note: 'This is your personal data under PDPA Section 30. You have the right to access, correct, or delete this data.'
        });
    } catch (err) {
        console.error('[PDPA] DSAR failed:', err.message);
        res.status(500).json({ error: 'Failed to retrieve personal data' });
    }
});

// Delete personal data (Right to be forgotten - Owner only)
app.delete('/api/pdpa/data', verifyOwnerToken, async (req, res) => {
    const { guestName, roomNumber, olderThanDays } = req.body;

    if (!guestName && !roomNumber) {
        return res.status(400).json({ error: 'Either guestName or roomNumber is required' });
    }

    try {
        // Delete consent records
        let consentDeleteQuery = 'DELETE FROM pdpa_consents WHERE 1=1';
        const consentParams = [];

        if (roomNumber) {
            consentDeleteQuery += ' AND room_number = ?';
            consentParams.push(String(roomNumber));
        }

        if (guestName) {
            consentDeleteQuery += ' AND guest_name LIKE ?';
            consentParams.push(`%${guestName}%`);
        }

        if (olderThanDays) {
            consentDeleteQuery += ' AND created_at < datetime(\'now\', \'-' + parseInt(olderThanDays) + ' days\')';
        }

        const consentResult = await new Promise((resolve, reject) => {
            db.db.run(consentDeleteQuery, consentParams, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });

        // Anonymize room records (instead of deleting to maintain integrity)
        let roomUpdateQuery = 'UPDATE rooms SET guest_name = NULL, guest_email = NULL, checkin_date = NULL, checkout_date = NULL WHERE 1=1';
        const roomParams = [];

        if (roomNumber) {
            roomUpdateQuery += ' AND id = ?';
            roomParams.push(String(roomNumber));
        }

        if (guestName) {
            roomUpdateQuery += ' AND guest_name LIKE ?';
            roomParams.push(`%${guestName}%`);
        }

        if (olderThanDays) {
            roomUpdateQuery += ' AND checkin_date < datetime(\'now\', \'-' + parseInt(olderThanDays) + ' days\')';
        }

        const roomResult = await new Promise((resolve, reject) => {
            db.db.run(roomUpdateQuery, roomParams, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });

        console.log(`[PDPA] 🗑️ Data deletion: ${consentResult} consent records, ${roomResult} room records anonymized`);

        res.json({
            success: true,
            message: 'Personal data deleted/anonymized successfully',
            deletedConsentRecords: consentResult,
            anonymizedRoomRecords: roomResult
        });
    } catch (err) {
        console.error('[PDPA] Data deletion failed:', err.message);
        res.status(500).json({ error: 'Failed to delete personal data' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Admin Approval Routes (/admin/approval)
// ═══════════════════════════════════════════════════════════════════════════

// ดึงรายการคำสั่งที่รอ approval
app.get('/api/admin/approval', verifyStaffToken, (req, res) => {
    try {
        const pending = gate.listPending();
        res.json({ success: true, pending });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ดึงรายละเอียดคำสั่งเฉพาะตัว
app.get('/api/admin/approval/:id', verifyStaffToken, (req, res) => {
    const record = gate.get(req.params.id);
    if (!record) {
        return res.status(404).json({ error: 'Approval request not found' });
    }
    res.json({ success: true, approval: record });
});

// Admin กด Approve
app.post('/api/admin/approval/:id/approve', verifyStaffToken, async (req, res) => {
    const { reason, decidedBy } = req.body;

    if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'reason is required' });
    }

    try {
        const record = gate.approve(req.params.id, {
            reason,
            decidedBy: decidedBy || `staff:${req.user.role}:${req.ip}`,
            ipAddress: req.ip,
        });

        // Log APPROVED event
        await appendAuditEvent(db.db, {
            traceId: record.command.traceId,
            eventType: 'APPROVED',
            command: { ...record.command, riskCode: record.classification.riskCode },
            approval: {
                decided_by: record.decidedBy,
                decided_at: record.decidedAt,
                reason: record.reason,
                ip_address: record.ipAddress,
            },
            expiry: {
                approved_at: record.approvedAt,
                expires_at: record.approvalExpiresAt,
                executed_at: null,
                expired: false,
            },
        });

        res.json({
            success: true,
            message: 'อนุมัติแล้ว — คำสั่งจะหมดอายุใน 60 วินาที',
            approval: gate.serialize(record),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Admin กด Reject
app.post('/api/admin/approval/:id/reject', verifyStaffToken, async (req, res) => {
    const { reason, decidedBy } = req.body;

    if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'reason is required' });
    }

    try {
        const record = gate.reject(req.params.id, {
            reason,
            decidedBy: decidedBy || `staff:${req.user.role}:${req.ip}`,
            ipAddress: req.ip,
        });

        // Log REJECTED event
        await appendAuditEvent(db.db, {
            traceId: record.command.traceId,
            eventType: 'REJECTED',
            command: { ...record.command, riskCode: record.classification.riskCode },
            approval: {
                decided_by: record.decidedBy,
                decided_at: record.decidedAt,
                reason: record.reason,
                ip_address: record.ipAddress,
            },
        });

        res.json({
            success: true,
            message: 'คำสั่งถูกปฏิเสธ',
            approval: gate.serialize(record),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Execute คำสั่งที่ได้รับอนุมัติแล้ว (ภายใน 60 วินาที)
app.post('/api/admin/approval/:id/execute', verifyStaffToken, async (req, res) => {
    try {
        const record = gate.consumeApproved(req.params.id);
        const command = record.command;

        // Rate Limiter check อีกรอบก่อนยิงจริง
        for (const room of command.targetRooms) {
            if (room === '*') continue;
            const rateResult = rateLimiter.check(room);
            if (!rateResult.allowed) {
                return res.status(429).json({
                    error: `ห้อง ${room} ส่งคำสั่งเกินขีดจำกัด`,
                    resetAt: rateResult.resetAt,
                });
            }
        }

        // Execute PBX command
        let hardwareResult;
        if (command.commandType === 'ROOM_ON' || command.commandType === 'ALL_ROOM_ON') {
            for (const room of command.targetRooms) {
                hardwareResult = await pbx.checkIn(room, command.guestName);
                rateLimiter.record(room);
                
                // Update SQLite Database
                await new Promise((resolve, reject) => {
                    db.updateRoomState(room, 'occupied', true, (err) => {
                        if (err) {
                            console.error(`[DB] Failed to update room ${room} state on approval execute:`, err.message);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            }
        } else if (command.commandType === 'ROOM_OFF' || command.commandType === 'ALL_ROOM_OFF') {
            for (const room of command.targetRooms) {
                hardwareResult = await pbx.checkOut(room);
                rateLimiter.record(room);
                
                // Update SQLite Database
                await new Promise((resolve, reject) => {
                    db.updateRoomState(room, 'vacant', false, (err) => {
                        if (err) {
                            console.error(`[DB] Failed to update room ${room} state on approval execute:`, err.message);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            }
        }

        // Mark as executed
        gate.markExecuted(req.params.id);

        // Log execution
        await appendAuditEvent(db.db, {
            traceId: command.traceId,
            eventType: 'APPROVED',
            command: { ...command, riskCode: record.classification.riskCode },
            expiry: {
                approved_at: record.approvedAt,
                expires_at: record.approvalExpiresAt,
                executed_at: new Date().toISOString(),
                expired: false,
            },
            result: { hardware: hardwareResult },
        });

        res.json({
            success: true,
            message: 'คำสั่งถูกดำเนินการแล้ว',
            trace_id: command.traceId,
            hardware_status: hardwareResult,
        });
    } catch (err) {
        // ถ้า approval หมดอายุ → log EXPIRED
        if (err.message.includes('expired')) {
            await appendAuditEvent(db.db, {
                traceId: req.params.id,
                eventType: 'EXPIRED',
                command: { commandType: 'UNKNOWN', targetRooms: [] },
            }).catch(() => {});
        }
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API Key Management Routes (/admin/apikeys)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/apikeys', verifyOwnerToken, (req, res) => {
    apiKeyService.listApiKeys((err, keys) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, keys });
    });
});

app.post('/api/admin/apikeys', verifyOwnerToken, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    
    apiKeyService.createApiKey(name, (err, keyInfo) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, key: keyInfo });
    });
});

app.delete('/api/admin/apikeys/:id', verifyOwnerToken, (req, res) => {
    apiKeyService.revokeApiKey(req.params.id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'API Key revoked successfully' });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wi-Fi Management Routes
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/wifi/status', verifyOwnerToken, async (req, res) => {
    try {
        const status = await wifiService.getStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/wifi/scan', verifyOwnerToken, async (req, res) => {
    try {
        const result = await wifiService.scanNetworks();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/wifi/connect', verifyOwnerToken, async (req, res) => {
    const { ssid, password } = req.body;
    if (!ssid) {
        return res.status(400).json({ success: false, error: 'SSID is required' });
    }
    try {
        const result = await wifiService.connect(ssid, password);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/wifi/disconnect', verifyOwnerToken, async (req, res) => {
    try {
        const result = await wifiService.disconnect();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/wifi/toggle', verifyOwnerToken, async (req, res) => {
    const { enabled } = req.body;
    if (enabled === undefined) {
        return res.status(400).json({ success: false, error: 'enabled parameter is required' });
    }
    try {
        const result = await wifiService.toggleWifi(enabled);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Audit Log Routes
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/audit/events', verifyOwnerToken, async (req, res) => {
    try {
        const events = await listAuditEvents(db.db, {
            traceId: req.query.trace_id,
            eventType: req.query.event_type,
            commandType: req.query.command_type,
            limit: req.query.limit,
        });
        res.json({ success: true, events });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear Audit Logs (Owner only)
app.delete('/api/audit/events', verifyOwnerToken, (req, res) => {
    db.db.run("DELETE FROM approval_audit_events", [], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'All audit events cleared successfully', count: this.changes });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// System Monitoring & Reporting Routes
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/system/report', verifyStaffToken, async (req, res) => {
    try {
        const report = await cronScheduler.generateAndSendReport(db, googleNotifier, pbx);
        res.json({ success: true, report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Telemetry & SSE Stream (/api/telemetry/stream)
// ═══════════════════════════════════════════════════════════════════════════
const os = require('os');
let sseClients = [];

app.get('/api/telemetry/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush headers to establish connection

    const clientId = Date.now();
    sseClients.push({ id: clientId, res });

    res.write(`data: ${JSON.stringify({ type: 'sys', data: 'SSE Connection Established' })}\n\n`);

    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

function broadcastTelemetry(type, data) {
    if (sseClients.length === 0) return;
    const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
    sseClients.forEach(client => client.res.write(payload));
}

// Bind PBX events to SSE
pbx.on('checkin', (data) => broadcastTelemetry('pbx', `✅ Check-in: Room ${data.roomNumber || data.room}`));
pbx.on('checkout', (data) => broadcastTelemetry('pbx', `🔴 Check-out: Room ${data.roomNumber || data.room}`));
pbx.on('heartbeat', () => broadcastTelemetry('pbx', `💓 Heartbeat OK`));
pbx.on('connection_lost', () => broadcastTelemetry('sys', `⚠️ PBX Connection lost!`));
pbx.on('reconnected', () => broadcastTelemetry('sys', `✅ PBX Reconnected!`));
pbx.on('error', (err) => broadcastTelemetry('pbx', `❌ Error: ${err.message}`));

// Periodically send CPU/RAM metrics
setInterval(() => {
    const cpuLoad = os.loadavg()[0]; 
    const cpus = os.cpus().length;
    const cpuPercent = Math.min((cpuLoad / cpus) * 100, 100).toFixed(1); 
    
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramPercent = (((totalMem - freeMem) / totalMem) * 100).toFixed(1);

    broadcastTelemetry('metrics', {
        cpu: parseFloat(cpuPercent),
        ram: parseFloat(ramPercent),
        wlanDown: (Math.random() * 0.5).toFixed(3), // Simulated network
        wlanUp: (Math.random() * 0.1).toFixed(3),
    });
}, 3000);

// ═══════════════════════════════════════════════════════════════════════════
// Docs & Static Files
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');

// API to serve OKF markdown documents
app.get('/api/docs', (req, res) => {
    // If the file parameter has no extension, append .md
    let filename = req.query.file || 'index.md';
    if (!filename.endsWith('.md')) {
        filename += '.md';
    }
    
    const safeFilename = path.basename(filename);
    let filePath = path.join(__dirname, '..', 'doc', safeFilename);
    
    // Check in root doc, if not found, check in doc/wiki
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, '..', 'doc', 'wiki', safeFilename);
    }
    
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ success: true, content });
    } else {
        res.status(404).json({ error: 'Document not found' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostics & Copilot Routes
// ═══════════════════════════════════════════════════════════════════════════
const { runDiagnostics } = require('./services/diagnostics');

app.get('/api/diagnostics/health', verifyStaffToken, async (req, res) => {
    try {
        const report = await runDiagnostics(db, pbx);
        res.json({ success: true, report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Rate limiting and alert tracking for Copilot
const copilotRequests = [];
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 15; // Max 15 requests/min overall
let lastTelegramAlertTime = 0;
const TELEGRAM_ALERT_COOLDOWN = 300000; // 5 minutes cooldown

app.post('/api/diagnostics/copilot', verifyOwnerToken, async (req, res) => {
    try {
        const { message, history } = req.body;
        
        // Rate limit verification
        const now = Date.now();
        while (copilotRequests.length > 0 && copilotRequests[0] < now - RATE_LIMIT_WINDOW) {
            copilotRequests.shift();
        }
        copilotRequests.push(now);

        if (copilotRequests.length > MAX_REQUESTS_PER_MINUTE) {
            console.warn(`[Copilot] 🚨 Rate limit exceeded: ${copilotRequests.length} req/min`);
            if (telegramBot && (now - lastTelegramAlertTime > TELEGRAM_ALERT_COOLDOWN)) {
                lastTelegramAlertTime = now;
                telegramBot.sendSystemAlert(
                    '🚨 AI Copilot Rate Spike',
                    `คำเตือน: ตรวจพบการเรียกใช้งาน AI Copilot ผิดปกติ (${copilotRequests.length} ครั้ง/นาที) ระบบได้ทำการจำกัดการใช้งานชั่วคราวเพื่อป้องกันเครดิตรั่วไหล`
                );
            }
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again shortly.'
            });
        }

        const report = await runDiagnostics(db, pbx);
        
        // Read troubleshooting guide
        let troubleshootingGuide = '';
        try {
            const guidePath = path.join(__dirname, '..', 'docs', 'wiki', 'troubleshooting.md');
            if (fs.existsSync(guidePath)) {
                troubleshootingGuide = fs.readFileSync(guidePath, 'utf8');
            }
        } catch (e) {
            console.error('Failed to read troubleshooting guide:', e.message);
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const openrouterKey = process.env.OPENROUTER_API_KEY;

        const buildFallbackReply = (reason) => {
            let fallbackReply = `⚠️ **Offline Fallback Enabled**\n*(Reason: ${reason})*\n\n`;
            fallbackReply += 'System Diagnostics Scan Summary:\n';
            
            let issuesFound = 0;
            if (report.pbx.status === 'red') {
                issuesFound++;
                fallbackReply += `🔴 **PBX Connection Error**: ${report.pbx.details}\n👉 *Action*: Check PBX power, and verify the LAN cable on the PBX and Pi is secure.\n\n`;
            }
            if (report.network.status === 'red') {
                issuesFound++;
                fallbackReply += `🔴 **Network/Internet Error**: ${report.network.details}\n👉 *Action*: Check internet gateway router and Ethernet connection.\n\n`;
            }
            if (report.database.status === 'red') {
                issuesFound++;
                fallbackReply += `🔴 **SQLite Database Error**: ${report.database.details}\n👉 *Action*: Verify read/write permissions at \`/home/ecs-agent/nithep/shc/data/hotel.db\`\n\n`;
            }

            if (issuesFound === 0) {
                fallbackReply += '🟢 **All core services are running healthy!** No critical issues detected.\n';
            }

            fallbackReply += '\n⚙️ *Troubleshooting Commands:*\n';
            fallbackReply += '* Check PBX port 23:\n```bash\ntelnet 192.168.1.91 23\n```\n';
            fallbackReply += '* Check Docker status:\n```bash\ndocker ps\n```\n';
            fallbackReply += '* Restart Backend API:\n```bash\ndocker restart hotel-app\n```\n';
            fallbackReply += '\n💡 *Note: To activate full AI Copilot chat, add a valid `GEMINI_API_KEY` or `OPENROUTER_API_KEY` inside `/home/ecs-agent/nithep/shc/config/.env`.*';
            return fallbackReply;
        };

        if (!apiKey && !openrouterKey) {
            return res.json({ success: true, reply: buildFallbackReply('Missing API Key config') });
        }

        // Call Gemini API using native fetch
        const systemPrompt = `You are ECS-Copilot, an expert IoT and systems troubleshooting assistant for the Smart Hotel ECS system.
We are running on a Raspberry Pi 4 connecting to a Phonik PBX and ECS-103R relays.
Here is the current real-time diagnostic report of the system:
${JSON.stringify(report, null, 2)}

Use this context to solve the user's issue. Also, here is the troubleshooting guide:
${troubleshootingGuide}

Additionally, you can control the hotel hardware (relays) on behalf of the user when they express a clear intent to turn ON or OFF lights/power for a specific room.
If you detect an intent to control room power (e.g., "เปิดไฟห้อง 101", "ปิดไฟ 102", "ช่วยเช็คเอาท์ห้อง 103"):
You MUST output a JSON block at the very end of your response inside a code block tagged with 'control-command', like this:
\`\`\`control-command
{"controlRequest": true, "action": "ON" | "OFF", "room": "101"}
\`\`\`
Choose "ON" for turning on power / check-in, and "OFF" for turning off power / check-out. Ensure the JSON is valid.

Be concise. Answer in Thai. Provide direct command line suggestions with copyable code blocks when appropriate (e.g. using SSH commands, restarting Docker containers, or editing config files). Keep responses under 400 words.`;

        const messages = [];
        if (history && Array.isArray(history)) {
            history.forEach(h => {
                messages.push({
                    role: h.role === 'user' ? 'user' : 'model',
                    parts: [{ text: h.content }]
                });
            });
        }
        messages.push({
            role: 'user',
            parts: [{ text: `System context: ${systemPrompt}\n\nUser Question: ${message}` }]
        });

        let reply = '';
        let apiSuccess = false;

        // 1. Try OpenRouter if key is present
        if (openrouterKey && !apiSuccess) {
            try {
                const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
                const openRouterMessages = [
                    { role: 'system', content: systemPrompt }
                ];
                if (history && Array.isArray(history)) {
                    history.forEach(h => {
                        openRouterMessages.push({
                            role: h.role === 'user' ? 'user' : 'assistant',
                            content: h.content
                        });
                    });
                }
                openRouterMessages.push({
                    role: 'user',
                    content: message
                });

                const response = await fetch(openRouterUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openrouterKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'google/gemini-2.5-flash',
                        messages: openRouterMessages,
                        max_tokens: 2000
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    let errObj = {};
                    try { errObj = JSON.parse(errText); } catch(e){}
                    const errMsg = errObj.error?.message || errText;
                    throw new Error(`OpenRouter error: ${errMsg}`);
                }

                const data = await response.json();
                reply = data.choices?.[0]?.message?.content || 'No response from OpenRouter';
                apiSuccess = true;
            } catch (openRouterErr) {
                console.error('OpenRouter call failed:', openRouterErr.message);
                if (!apiKey) {
                    return res.json({ success: true, reply: buildFallbackReply(`OpenRouter error: ${openRouterErr.message}`) });
                }
            }
        }

        // 2. Fallback to native Gemini API if key is present
        if (apiKey && !apiSuccess) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: messages })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    let errObj = {};
                    try { errObj = JSON.parse(errText); } catch(e){}
                    const errMsg = errObj.error?.message || errText;
                    throw new Error(errMsg);
                }

                const data = await response.json();
                reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI';
                apiSuccess = true;
            } catch (apiErr) {
                console.error('Gemini API call failed:', apiErr.message);
                return res.json({ success: true, reply: buildFallbackReply(`Gemini API error: ${apiErr.message}`) });
            }
        }

        // ─── AI Control Execution Loop ───────────────────────────────────────
        const controlRegex = /```control-command\s*([\s\S]*?)\s*```/;
        const match = reply.match(controlRegex);
        
        if (match) {
            try {
                const cmdJson = JSON.parse(match[1].trim());
                if (cmdJson.controlRequest && cmdJson.action && cmdJson.room) {
                    const roomNumber = cmdJson.room;
                    const action = cmdJson.action.toUpperCase();
                    const commandType = action === 'ON' ? 'ROOM_ON' : 'ROOM_OFF';
                    
                    console.log(`[AI Control] Copilot detected intent: Room ${roomNumber} -> ${action}`);
                    
                    const aiCommand = buildCommand(commandType, roomNumber, {
                        source: 'copilot_chat',
                        flow: 'ai_control',
                        requestedBy: `ai_copilot:owner`
                    });
                    
                    // Run command through safety gate
                    const safetyResult = await executeWithSafety(aiCommand, async () => {
                        if (commandType === 'ROOM_ON') {
                            return await pbx.checkIn(roomNumber, 'AI Force ON');
                        } else {
                            return await pbx.checkOut(roomNumber);
                        }
                    });
                    
                    if (safetyResult.blocked) {
                        reply = reply.replace(controlRegex, `\n\n*(⚠️ การสั่งการฮาร์ดแวร์ถูกระงับ: ${safetyResult.reason})*`);
                    } else {
                        // Update DB State
                        const dbStatus = commandType === 'ROOM_ON' ? 'occupied' : 'vacant';
                        const isOccupied = commandType === 'ROOM_ON';
                        
                        await new Promise((resolve) => {
                            db.updateRoomState(roomNumber, dbStatus, isOccupied, (err) => {
                                if (err) console.error(`[AI Control] DB update failed:`, err.message);
                                resolve();
                            });
                        });
                        
                        reply = reply.replace(controlRegex, `\n\n*(⚡ ระบบควบคุม AI สั่งการสำเร็จ: สั่ง ${action} ระบบไฟห้อง ${roomNumber} เรียบร้อยแล้วครับ 🟢)*`);
                    }
                }
            } catch (err) {
                console.error('[AI Control] Failed to parse control command JSON:', err.message);
                reply = reply.replace(controlRegex, '\n\n*(❌ เกิดข้อผิดพลาดในการอ่านคำสั่งควบคุม)*');
            }
        }

        return res.json({ success: true, reply });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../app/dist')));

// React Router Fallback
app.use((req, res, next) => {
    if (req.path.startsWith('/assets/') || req.path.startsWith('/api/')) {
        return res.status(404).send('Not Found');
    }
    res.sendFile(path.join(__dirname, '../app/dist/index.html'));
});

// Start Server — connect PBX first, then listen
async function startServer() {
    try {
        await pbx.connect();
        console.log(`[PBX] ✅ Connected in ${PBX_MODE} mode`);
        // Trigger initial sync upon cold boot
        syncPbxStateWithDatabase();

        // Setup periodic Digital Twin sync loop (every 5 minutes)
        setInterval(() => {
            console.log(`[SYNC] 🔄 Running scheduled Digital Twin Synchronization...`);
            syncPbxStateWithDatabase();
        }, 5 * 60 * 1000);
    } catch (err) {
        console.warn(`[PBX] ⚠️ PBX connection failed at startup: ${err.message} — server will start anyway`);
        scheduleReconnection();
    }

    // Initialize daily reporting cronjob
    cronScheduler.startCronJobs(db, googleNotifier, pbx);

    app.listen(PORT, '0.0.0.0', () => {
        const os = require('os');
        const nets = os.networkInterfaces();
        let localIP = 'unknown';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    localIP = net.address;
                }
            }
        }
        console.log(`\n========================================`);
        console.log(`🚀 Backend API Server running on port ${PORT}`);
        console.log(`🔧 PBX Mode: ${PBX_MODE}`);
        console.log(`🛡️  Safety: Approval Gate + Audit Log + Rate Limiter`);
        console.log(`🌐 Access from browser: http://${localIP}:${PORT}`);
        console.log(`========================================\n`);
    });
}

startServer();
