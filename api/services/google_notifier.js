'use strict';

/**
 * @file google_notifier.js — บริการแจ้งเตือนไปยัง Google Chat (Front Desk)
 *
 * ส่งข้อความผ่าน Webhook เพื่อแจ้งเตือนพนักงานเมื่อมีการ Check-in หรือ Check-out
 * โดยใช้รูปแบบ Card ของ Google Chat เพื่อความสวยงามและอ่านง่าย
 */

class GoogleNotifier {
    /**
     * @param {Object} options
     * @param {string} options.chatWebhookUrl - Google Chat Webhook URL
     * @param {string} options.sheetsWebhookUrl - Google Sheets Webhook (Apps Script) URL
     */
    constructor(options = {}) {
        this.chatWebhookUrl = options.chatWebhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL;
        this.sheetsWebhookUrl = options.sheetsWebhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    }

    /**
     * ตรวจสอบว่าเปิดใช้งาน Webhook สำหรับ Chat หรือไม่
     */
    isChatActive() {
        return !!this.chatWebhookUrl;
    }

    /**
     * ตรวจสอบว่าเปิดใช้งาน Webhook สำหรับ Sheets หรือไม่
     */
    isSheetsActive() {
        return !!this.sheetsWebhookUrl;
    }

    /**
     * ส่งการแจ้งเตือน Check-in เข้า Google Chat
     * @param {Object} data 
     * @param {string} data.roomNumber - เลขห้อง
     * @param {string} data.guestName - ชื่อแขก
     * @param {string} data.time - เวลาที่ทำรายการ
     */
    async sendCheckinAlert(data) {
        // 1. ส่งข้อมูลไป Google Sheets (ถ้ามี)
        if (this.isSheetsActive()) {
            this._sendToSheets({ ...data, action: 'Check-in' });
        }

        // 2. ส่งข้อความเข้า Google Chat
        if (!this.isChatActive()) return;

        const message = {
            cardsV2: [
                {
                    cardId: `checkin_${Date.now()}`,
                    card: {
                        header: {
                            title: '🛎️ New Check-In Alert',
                            subtitle: 'มีการสแกนเช็คอินเข้าห้องพัก',
                            imageUrl: 'https://cdn-icons-png.flaticon.com/512/5903/5903332.png',
                            imageType: 'CIRCLE'
                        },
                        sections: [
                            {
                                widgets: [
                                    {
                                        decoratedText: {
                                            topLabel: 'Room Number',
                                            text: `<b>${data.roomNumber}</b>`,
                                            startIcon: { knownIcon: 'HOTEL' }
                                        }
                                    },
                                    {
                                        decoratedText: {
                                            topLabel: 'Guest Name',
                                            text: data.guestName || '<i>ไม่ได้ระบุชื่อ</i>',
                                            startIcon: { knownIcon: 'PERSON' }
                                        }
                                    },
                                    {
                                        decoratedText: {
                                            topLabel: 'Time',
                                            text: data.time || new Date().toLocaleString('th-TH'),
                                            startIcon: { knownIcon: 'CLOCK' }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        };

        return this._send(message);
    }

    /**
     * ส่งการแจ้งเตือน Check-out เข้า Google Chat
     * @param {Object} data 
     * @param {string} data.roomNumber - เลขห้อง
     * @param {string} data.time - เวลาที่ทำรายการ
     */
    async sendCheckoutAlert(data) {
        // 1. ส่งข้อมูลไป Google Sheets (ถ้ามี)
        if (this.isSheetsActive()) {
            this._sendToSheets({ ...data, action: 'Check-out' });
        }

        // 2. ส่งข้อความเข้า Google Chat
        if (!this.isChatActive()) return;

        const message = {
            cardsV2: [
                {
                    cardId: `checkout_${Date.now()}`,
                    card: {
                        header: {
                            title: '🚪 Check-Out Alert',
                            subtitle: 'ลูกค้าทำการเช็คเอาท์',
                            imageUrl: 'https://cdn-icons-png.flaticon.com/512/5903/5903348.png',
                            imageType: 'CIRCLE'
                        },
                        sections: [
                            {
                                widgets: [
                                    {
                                        decoratedText: {
                                            topLabel: 'Room Number',
                                            text: `<b>${data.roomNumber}</b>`,
                                            startIcon: { knownIcon: 'HOTEL' }
                                        }
                                    },
                                    {
                                        decoratedText: {
                                            topLabel: 'Time',
                                            text: data.time || new Date().toLocaleString('th-TH'),
                                            startIcon: { knownIcon: 'CLOCK' }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        };

        return this._send(message);
    }

    /**
     * ส่งการแจ้งเตือนสถานะระบบ (System Alert / Reports)
     * @param {string} title - หัวข้อการแจ้งเตือน
     * @param {string} message - ข้อความรายละเอียด
     * @param {boolean} isError - เป็นข้อความเตือน Error หรือไม่ (เพื่อปรับเปลี่ยน Icon)
     */
    async sendSystemAlert(title, message, isError = true) {
        if (!this.isChatActive()) return;

        const payload = {
            cardsV2: [
                {
                    cardId: `alert_${Date.now()}`,
                    card: {
                        header: {
                            title: title,
                            subtitle: 'System Notification',
                            imageUrl: isError ? 'https://cdn-icons-png.flaticon.com/512/1008/1008928.png' : 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
                            imageType: 'CIRCLE'
                        },
                        sections: [
                            {
                                widgets: [
                                    {
                                        decoratedText: {
                                            topLabel: 'Message',
                                            text: `<b>${message}</b>`,
                                            startIcon: { knownIcon: isError ? 'WARNING' : 'DESCRIPTION' }
                                        }
                                    },
                                    {
                                        decoratedText: {
                                            topLabel: 'Time',
                                            text: new Date().toLocaleString('th-TH'),
                                            startIcon: { knownIcon: 'CLOCK' }
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        };

        return this._send(payload);
    }

    async _send(payload) {
        try {
            console.log(`[GOOGLE CHAT] 📤 Sending webhook to: ${this.chatWebhookUrl.substring(0, 50)}...`);
            const response = await fetch(this.chatWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google Chat API responded with status ${response.status}: ${errText}`);
            }
            console.log(`[GOOGLE CHAT] 📬 Webhook sent successfully! Status: ${response.status}`);
            return true;
        } catch (error) {
            console.error('[GOOGLE CHAT] ❌ Failed to send webhook:', error.message);
            return false;
        }
    }

    async _sendToSheets(payload) {
        try {
            console.log(`[GOOGLE SHEETS] 📤 Sending data to: ${this.sheetsWebhookUrl.substring(0, 50)}...`);
            const response = await fetch(this.sheetsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errText = await response.text();
                console.error(`[GOOGLE SHEETS] ❌ Failed to save log. Status: ${response.status}. Response: ${errText}`);
            } else {
                const resText = await response.text();
                console.log(`[GOOGLE SHEETS] 📬 Log saved successfully! Status: ${response.status}. Response: ${resText}`);
            }
        } catch (error) {
            console.error('[GOOGLE SHEETS] ❌ Webhook error:', error.message);
        }
    }
}

module.exports = { GoogleNotifier };
