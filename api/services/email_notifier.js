'use strict';

/**
 * @file email_notifier.js — บริการส่งอีเมลแจ้งเตือนผ่าน Google Workspace SMTP
 * 
 * รองรับการส่งอีเมลยืนยัน Check-in / Check-out และรายงานเหตุขัดข้องทางฮาร์ดแวร์
 * เข้าสู่บัญชีศูนย์กลาง (เช่น support@nithep.com) โดยใช้ App Password 16 หลัก
 */

const tls = require('tls');
const fs = require('fs');

class EmailNotifier {
    /**
     * @param {Object} options
     * @param {string} options.smtpHost - SMTP Server (default: smtp.gmail.com)
     * @param {number} options.smtpPort - SSL Port (default: 465)
     * @param {string} options.user - Google Workspace Email (e.g. support@nithep.com)
     * @param {string} options.appPassword - 16-character App Password
     */
    constructor(options = {}) {
        this.smtpHost = options.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
        this.smtpPort = parseInt(options.smtpPort || process.env.SMTP_PORT || '465', 10);
        this.user = options.user || process.env.SMTP_USER || 'support@nithep.com';
        this.appPassword = options.appPassword || process.env.SMTP_APP_PASSWORD || '';
        this.enabled = options.enabled !== false && !!(this.user && this.appPassword);
    }

    /**
     * ตรวจสอบความพร้อมของระบบส่งอีเมล
     */
    isConfigured() {
        return !!(this.user && this.appPassword);
    }

    /**
     * ส่งอีเมลแจ้งเตือน Check-in
     */
    async sendCheckinEmail({ roomNumber, guestName, checkinTime }) {
        if (!this.isConfigured()) {
            console.log(`[EmailNotifier] ⚠️ Skipped sending checkin email (SMTP credentials not configured)`);
            return { success: false, reason: 'unconfigured' };
        }

        const subject = `🛎️ [Hotel ECS] Check-in Alert: ห้อง ${roomNumber}`;
        const html = `
            <div style="font-family: 'Prompt', Arial, sans-serif; background-color: #0B0F19; color: #F3F4F6; padding: 24px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(255,255,255,0.1);">
                <h2 style="color: #00F2FE; margin-top: 0;">🛎️ การเช็คอินเข้าห้องพักสำเร็จ</h2>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;" />
                <p><strong>หมายเลขห้อง:</strong> <span style="font-size: 18px; color: #FFD700;">ห้อง ${roomNumber}</span></p>
                <p><strong>ชื่อผู้เข้าพัก:</strong> ${guestName || 'ไม่ระบุชื่อ'}</p>
                <p><strong>เวลาที่เช็คอิน:</strong> ${checkinTime || new Date().toLocaleString('th-TH')}</p>
                <p><strong>สถานะระบบไฟ (PBX Relay):</strong> <span style="color: #10B981; font-weight: bold;">ON (เปิดกระแสไฟ)</span></p>
                <br/>
                <div style="font-size: 12px; color: #9CA3AF; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                    Hotel Energy Control Server • nithep.com
                </div>
            </div>
        `;

        return this._sendMail({ to: this.user, subject, html });
    }

    /**
     * ส่งอีเมลแจ้งเตือน Check-out
     */
    async sendCheckoutEmail({ roomNumber, guestName, checkoutTime }) {
        if (!this.isConfigured()) {
            console.log(`[EmailNotifier] ⚠️ Skipped sending checkout email (SMTP credentials not configured)`);
            return { success: false, reason: 'unconfigured' };
        }

        const subject = `🔑 [Hotel ECS] Check-out Alert: ห้อง ${roomNumber}`;
        const html = `
            <div style="font-family: 'Prompt', Arial, sans-serif; background-color: #0B0F19; color: #F3F4F6; padding: 24px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(255,255,255,0.1);">
                <h2 style="color: #EC4899; margin-top: 0;">🔑 การเช็คเอาท์ออกจากห้องพัก</h2>
                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;" />
                <p><strong>หมายเลขห้อง:</strong> <span style="font-size: 18px; color: #FFD700;">ห้อง ${roomNumber}</span></p>
                <p><strong>ชื่อผู้เข้าพัก:</strong> ${guestName || 'ไม่ระบุชื่อ'}</p>
                <p><strong>เวลาที่ทำรายการ:</strong> ${checkoutTime || new Date().toLocaleString('th-TH')}</p>
                <p><strong>สถานะระบบไฟ (PBX Relay):</strong> <span style="color: #EF4444; font-weight: bold;">OFF (ตัดกระแสไฟแล้ว)</span></p>
                <br/>
                <div style="font-size: 12px; color: #9CA3AF; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                    Hotel Energy Control Server • nithep.com
                </div>
            </div>
        `;

        return this._sendMail({ to: this.user, subject, html });
    }

    /**
     * ส่งคำสั่งทาง TLS/SMTP Protocol ระดับล่างแบบ Zero-dependency
     */
    _sendMail({ to, subject, html }) {
        return new Promise((resolve) => {
            const socket = tls.connect(this.smtpPort, this.smtpHost, { rejectUnauthorized: false }, () => {
                let step = 0;
                const authUser = Buffer.from(this.user).toString('base64');
                const authPass = Buffer.from(this.appPassword.replace(/\s+/g, '')).toString('base64');

                socket.on('data', (data) => {
                    const str = data.toString();
                    if (step === 0 && str.startsWith('220')) {
                        socket.write(`EHLO nithep.com\r\n`);
                        step++;
                    } else if (step === 1 && str.startsWith('250')) {
                        socket.write(`AUTH LOGIN\r\n`);
                        step++;
                    } else if (step === 2 && str.startsWith('334')) {
                        socket.write(`${authUser}\r\n`);
                        step++;
                    } else if (step === 3 && str.startsWith('334')) {
                        socket.write(`${authPass}\r\n`);
                        step++;
                    } else if (step === 4 && str.startsWith('235')) {
                        socket.write(`MAIL FROM:<${this.user}>\r\n`);
                        step++;
                    } else if (step === 5 && str.startsWith('250')) {
                        socket.write(`RCPT TO:<${to}>\r\n`);
                        step++;
                    } else if (step === 6 && str.startsWith('250')) {
                        socket.write(`DATA\r\n`);
                        step++;
                    } else if (step === 7 && str.startsWith('354')) {
                        const rawMsg = [
                            `From: "Hotel ECS Alert" <${this.user}>`,
                            `To: <${to}>`,
                            `Subject: ${subject}`,
                            `MIME-Version: 1.0`,
                            `Content-Type: text/html; charset=UTF-8`,
                            ``,
                            html,
                            `.\r\n`
                        ].join('\r\n');
                        socket.write(rawMsg);
                        step++;
                    } else if (step === 8 && str.startsWith('250')) {
                        socket.write(`QUIT\r\n`);
                        socket.end();
                        resolve({ success: true, messageId: `msg_${Date.now()}` });
                    }
                });
            });

            socket.on('error', (err) => {
                console.error(`[EmailNotifier] SMTP Connection Error:`, err.message);
                resolve({ success: false, error: err.message });
            });
        });
    }
}

module.exports = EmailNotifier;
