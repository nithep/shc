'use strict';

const https = require('https');

class TelegramBotService {
    constructor(options = {}) {
        this.token = options.token || process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = options.chatId || process.env.TELEGRAM_CHAT_ID;
        this.gate = options.gate;
        this.pbx = options.pbx;
        this.rateLimiter = options.rateLimiter;
        this.db = options.db;
        this.appendAuditEvent = options.appendAuditEvent;
        this.offset = 0;
        this.isRunning = false;
    }

    start() {
        if (!this.token) {
            console.warn('[TELEGRAM] ⚠️ No TELEGRAM_BOT_TOKEN provided in environment. Telegram Bot service is disabled.');
            return;
        }
        if (!this.chatId) {
            console.warn('[TELEGRAM] ⚠️ No TELEGRAM_CHAT_ID provided in environment. Telegram notifications might fail.');
        }
        this.isRunning = true;
        console.log('[TELEGRAM] 🚀 Telegram Bot polling service started...');
        this._poll();
    }

    stop() {
        this.isRunning = false;
        console.log('[TELEGRAM] 🛑 Telegram Bot polling service stopped.');
    }

    async request(method, payload = {}) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.token}/${method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed.ok) {
                            resolve(parsed.result);
                        } else {
                            reject(new Error(parsed.description || 'Telegram API Error'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.write(data);
            req.end();
        });
    }

    async sendMessage(text, options = {}) {
        if (!this.chatId) return;
        try {
            return await this.request('sendMessage', {
                chat_id: this.chatId,
                text,
                parse_mode: 'Markdown',
                ...options
            });
        } catch (err) {
            console.error('[TELEGRAM] Failed to send message:', err.message);
        }
    }

    async sendApprovalRequest(pendingRecord) {
        const { approvalId, command, classification, pendingExpiresAt } = pendingRecord;
        
        const message = 
`⚠️ *คำขออนุมัติคำสั่งเสี่ยงสูง (High-Risk Command)*
━━━━━━━━━━━━━━━━━━━━
📌 *ประเภท:* ${classification.riskCode} - ${classification.riskName}
🔴 *ระดับความเสี่ยง:* ${classification.riskLevel.toUpperCase()}
💬 *เหตุผลความเสี่ยง:* ${classification.reason}
━━━━━━━━━━━━━━━━━━━━
⚙️ *รายละเอียดคำสั่ง:*
• *คำสั่ง:* \`${command.commandType}\`
• *ห้องที่ได้รับผลกระทบ:* \`${command.targetRooms.join(', ')}\`
• *ร้องขอโดย:* \`${command.requestedBy}\`
• *ช่องทาง:* \`${command.source}\`
• *โหมดทดสอบ (Dry Run):* \`${command.dryRun ? 'ใช่' : 'ไม่ใช่'}\`
━━━━━━━━━━━━━━━━━━━━
⏱️ *หมดอายุภายใน 10 นาที* (หมดเวลา: ${new Date(pendingExpiresAt).toLocaleTimeString('th-TH')})`;

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ อนุมัติ (Approve)', callback_data: `approve:${approvalId}` },
                    { text: '❌ ปฏิเสธ (Reject)', callback_data: `reject:${approvalId}` }
                ]
            ]
        };

        try {
            const result = await this.sendMessage(message, {
                reply_markup: replyMarkup
            });
            console.log(`[TELEGRAM] Sent approval request notification for ${approvalId}`);
            return result;
        } catch (err) {
            console.error('[TELEGRAM] Failed to send approval request:', err.message);
        }
    }

    async sendSystemAlert(alertType, detail) {
        const message = 
`🚨 *ระบบแจ้งเตือนความผิดปกติ (System Alert)*
━━━━━━━━━━━━━━━━━━━━
⚠️ *เหตุการณ์:* ${alertType}
🔍 *รายละเอียด:* \`${detail}\`
🕒 *เวลา:* ${new Date().toLocaleString('th-TH')}`;

        return this.sendMessage(message);
    }

    async _poll() {
        while (this.isRunning) {
            try {
                const updates = await this.request('getUpdates', {
                    offset: this.offset,
                    timeout: 20,
                    allowed_updates: ['callback_query', 'message']
                });

                for (const update of updates) {
                    this.offset = update.update_id + 1;
                    await this._handleUpdate(update);
                }
            } catch (err) {
                // If there's an error (e.g. network timeout or API error), wait 5 seconds before retrying
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }

    async _handleUpdate(update) {
        if (update.callback_query) {
            await this._handleCallbackQuery(update.callback_query);
        } else if (update.message) {
            await this._handleMessage(update.message);
        }
    }

    async _handleMessage(message) {
        // Handle start or info commands if someone texts the bot directly
        const text = message.text || '';
        if (text.startsWith('/start') || text.startsWith('/info')) {
            const welcomeText = 
`🤖 *Hotel-ECS Admin Bot*
━━━━━━━━━━━━━━━━━━━━
บอทนี้ใช้สำหรับแจ้งเตือนสถานะความปลอดภัย และอนุมัติคำสั่งเสี่ยงสูงของระบบควบคุมไฟฟ้าโรงแรม

• *Chat ID ของห้องนี้:* \`${message.chat.id}\`
(กรุณานำไปใส่ในไฟล์ \`.env\` เป็นค่า \`TELEGRAM_CHAT_ID\`)`;
            
            try {
                await this.request('sendMessage', {
                    chat_id: message.chat.id,
                    text: welcomeText,
                    parse_mode: 'Markdown'
                });
            } catch (err) {
                console.error('[TELEGRAM] Failed to send welcome message:', err.message);
            }
        }
    }

    async _handleCallbackQuery(callbackQuery) {
        const data = callbackQuery.data || '';
        const userId = callbackQuery.from.id;
        const userName = callbackQuery.from.username ? `@${callbackQuery.from.username}` : `User ID: ${userId}`;
        
        const [action, approvalId] = data.split(':');

        if (!action || !approvalId) return;

        console.log(`[TELEGRAM] Callback Query received - Action: ${action}, Approval ID: ${approvalId} from ${userName}`);

        const record = this.gate.get(approvalId);
        if (!record) {
            await this.request('answerCallbackQuery', {
                callback_query_id: callbackQuery.id,
                text: '⚠️ ไม่พบคำขอนี้ หรือคำขอหมดอายุแล้ว',
                show_alert: true
            });
            return;
        }

        if (action === 'approve') {
            try {
                // 1. Approve
                const approvedRecord = this.gate.approve(approvalId, {
                    reason: `อนุมัติผ่าน Telegram โดย ${userName}`,
                    decidedBy: `telegram:${userId}`,
                    ipAddress: 'telegram'
                });

                // Log APPROVED event
                await this.appendAuditEvent(this.db, {
                    traceId: approvedRecord.command.traceId,
                    eventType: 'APPROVED',
                    command: { ...approvedRecord.command, riskCode: approvedRecord.classification.riskCode },
                    approval: {
                        decided_by: approvedRecord.decidedBy,
                        decided_at: approvedRecord.decidedAt,
                        reason: approvedRecord.reason,
                        ip_address: approvedRecord.ipAddress,
                    },
                    expiry: {
                        approved_at: approvedRecord.approvedAt,
                        expires_at: approvedRecord.approvalExpiresAt,
                        executed_at: null,
                        expired: false,
                    },
                });

                // 2. Execute approved command immediately
                const consumedRecord = this.gate.consumeApproved(approvalId);
                const command = consumedRecord.command;

                // Rate limiter check
                for (const room of command.targetRooms) {
                    if (room === '*') continue;
                    const rateResult = this.rateLimiter.check(room);
                    if (!rateResult.allowed) {
                        throw new Error(`ห้อง ${room} ส่งคำสั่งเกินขีดจำกัด`);
                    }
                }

                // Execute
                let hardwareResult;
                if (!command.dryRun) {
                    if (command.commandType === 'ROOM_ON' || command.commandType === 'ALL_ROOM_ON') {
                        for (const room of command.targetRooms) {
                            hardwareResult = await this.pbx.checkIn(room, command.guestName);
                            this.rateLimiter.record(room);
                        }
                    } else if (command.commandType === 'ROOM_OFF' || command.commandType === 'ALL_ROOM_OFF') {
                        for (const room of command.targetRooms) {
                            hardwareResult = await this.pbx.checkOut(room);
                            this.rateLimiter.record(room);
                        }
                    }
                } else {
                    hardwareResult = { success: true, status: 'DRY_RUN_PASSED', message: 'คำสั่งผ่านการอนุมัติแบบทดสอบ (Dry Run)' };
                }

                // Mark executed
                this.gate.markExecuted(approvalId);

                // Log execution event
                await this.appendAuditEvent(this.db, {
                    traceId: command.traceId,
                    eventType: 'APPROVED',
                    command: { ...command, riskCode: approvedRecord.classification.riskCode },
                    expiry: {
                        approved_at: approvedRecord.approvedAt,
                        expires_at: approvedRecord.approvalExpiresAt,
                        executed_at: new Date().toISOString(),
                        expired: false,
                    },
                    result: { hardware: hardwareResult },
                });

                // Answer Callback
                await this.request('answerCallbackQuery', {
                    callback_query_id: callbackQuery.id,
                    text: '✅ อนุมัติและดำเนินการคำสั่งสำเร็จ'
                });

                // Edit Message to show success status without buttons
                const editedMessage = 
`${callbackQuery.message.text}

━━━━━━━━━━━━━━━━━━━━
✅ *อนุมัติแล้วโดยแอดมิน:* ${userName}
🕒 *เวลาอนุมัติ:* ${new Date().toLocaleTimeString('th-TH')}
⚙️ *สถานะการดำเนินการ:* สำเร็จเรียบร้อย (Dry Run: ${command.dryRun ? 'ใช่' : 'ไม่ใช่'})`;

                await this.request('editMessageText', {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id,
                    text: editedMessage,
                    parse_mode: 'Markdown'
                });

            } catch (err) {
                console.error('[TELEGRAM] Approval execution failed:', err.message);
                await this.request('answerCallbackQuery', {
                    callback_query_id: callbackQuery.id,
                    text: `❌ การดำเนินการล้มเหลว: ${err.message}`,
                    show_alert: true
                });

                // Edit Message to show failure status and remove buttons
                const failedMessage = 
`${callbackQuery.message.text}

━━━━━━━━━━━━━━━━━━━━
✅ *อนุมัติแล้วโดยแอดมิน:* ${userName}
🕒 *เวลาอนุมัติ:* ${new Date().toLocaleTimeString('th-TH')}
❌ *สถานะการดำเนินการ:* ล้มเหลว (${err.message})`;

                await this.request('editMessageText', {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id,
                    text: failedMessage,
                    parse_mode: 'Markdown'
                }).catch(() => {});
            }
        } else if (action === 'reject') {
            try {
                // Reject
                const rejectedRecord = this.gate.reject(approvalId, {
                    reason: `ปฏิเสธผ่าน Telegram โดย ${userName}`,
                    decidedBy: `telegram:${userId}`,
                    ipAddress: 'telegram'
                });

                // Log REJECTED event
                await this.appendAuditEvent(this.db, {
                    traceId: rejectedRecord.command.traceId,
                    eventType: 'REJECTED',
                    command: { ...rejectedRecord.command, riskCode: rejectedRecord.classification.riskCode },
                    approval: {
                        decided_by: rejectedRecord.decidedBy,
                        decided_at: rejectedRecord.decidedAt,
                        reason: rejectedRecord.reason,
                        ip_address: rejectedRecord.ipAddress,
                    },
                });

                await this.request('answerCallbackQuery', {
                    callback_query_id: callbackQuery.id,
                    text: '❌ ปฏิเสธคำสั่งเรียบร้อย'
                });

                // Edit Message to show rejected status without buttons
                const editedMessage = 
`${callbackQuery.message.text}

━━━━━━━━━━━━━━━━━━━━
❌ *ปฏิเสธโดยแอดมิน:* ${userName}
🕒 *เวลาปฏิเสธ:* ${new Date().toLocaleTimeString('th-TH')}`;

                await this.request('editMessageText', {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id,
                    text: editedMessage,
                    parse_mode: 'Markdown'
                });

            } catch (err) {
                console.error('[TELEGRAM] Reject failed:', err.message);
                await this.request('answerCallbackQuery', {
                    callback_query_id: callbackQuery.id,
                    text: `❌ ไม่สามารถปฏิเสธได้: ${err.message}`,
                    show_alert: true
                });
            }
        }
    }
}

module.exports = { TelegramBotService };
