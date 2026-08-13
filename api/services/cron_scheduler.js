const cron = require('node-cron');

/**
 * เริ่มต้นระบบ Cronjob เพื่อรายงานสรุปประจำวัน
 * @param {Object} db - Database module (backend/db.js)
 * @param {Object} googleNotifier - GoogleNotifier instance
 * @param {Object} pbx - PBX Connector instance
 */
function startCronJobs(db, googleNotifier, pbx) {
    console.log('[CRON] 🕒 Initializing daily cron jobs...');

    // Run every day at 23:55 (11:55 PM)
    cron.schedule('55 23 * * *', async () => {
        console.log('[CRON] 📊 Generating daily system report...');
        await generateAndSendReport(db, googleNotifier, pbx);
    }, {
        scheduled: true,
        timezone: "Asia/Bangkok"
    });

    // Auto-Eviction: Run every day at 12:00 PM (Noon)
    cron.schedule('0 12 * * *', async () => {
        console.log('[CRON] ⏰ Running Auto-Eviction Check at 12:00 PM...');
        await runAutoEviction(db, googleNotifier, pbx);
    }, {
        scheduled: true,
        timezone: "Asia/Bangkok"
    });
}

/**
 * ตัดไฟอัตโนมัติสำหรับห้องที่หมดเวลาพัก (checkout_date <= now)
 */
async function runAutoEviction(db, googleNotifier, pbx) {
    db.getAllRooms(async (err, rooms) => {
        if (err) {
            console.error('[CRON] ❌ Error fetching rooms for auto-eviction:', err.message);
            return;
        }

        const now = new Date();
        const occupiedRooms = rooms.filter(r => r.status === 'occupied');
        let evictedCount = 0;

        for (const room of occupiedRooms) {
            if (room.checkout_date) {
                const checkoutDate = new Date(room.checkout_date);
                if (checkoutDate <= now) {
                    console.log(`[CRON] ⚡ Auto-evicting Room ${room.id} (Checkout date: ${room.checkout_date})`);
                    
                    try {
                        // ส่งคำสั่งตัดไฟไปที่ตู้สาขา (pbx.checkOut มี _sendWithRetry ในตัวอยู่แล้ว)
                        const hardwareResult = await pbx.checkOut(room.id);
                        
                        // ตรวจสอบผลลัพธ์ (State Verifier)
                        if (hardwareResult && hardwareResult.success) {
                            // สำเร็จ: อัปเดตฐานข้อมูลให้เป็นห้องว่าง
                            db.updateRoomState(room.id, 'vacant', false, {}, (updateErr) => {
                                if (updateErr) {
                                    console.error(`[CRON] ❌ DB update failed for evicted room ${room.id}:`, updateErr.message);
                                } else {
                                    evictedCount++;
                                    if (googleNotifier) {
                                        googleNotifier.sendSystemAlert('⏰ Auto-Eviction Triggered', `ระบบทำการตัดไฟห้องพัก <b>${room.id}</b> อัตโนมัติ<br>เนื่องจากเกินเวลาเช็คเอาท์ (12:00 น.)<br>สถานะ PBX: ACK (สำเร็จ)`, false);
                                    }
                                }
                            });
                        } else {
                            // NACK หรือล้มเหลว (แม้จะ retry จาก pbx แล้วก็ตาม)
                            throw new Error('Hardware returned unsuccessful result (NACK/Timeout)');
                        }
                    } catch (evictErr) {
                        console.error(`[CRON] ❌ PBX eviction failed for room ${room.id}:`, evictErr.message);
                        if (googleNotifier) {
                            googleNotifier.sendSystemAlert('⚠️ Auto-Eviction Failed', `ระวัง! ห้อง <b>${room.id}</b> ถึงเวลาเช็คเอาท์แต่ตู้สาขาปฏิเสธคำสั่งตัดไฟ (NACK/Timeout)<br>กรุณาส่งพนักงานไปตรวจสอบ<br>Error: ${evictErr.message}`, true);
                        }
                    }
                }
            }
        }
        
        if (evictedCount === 0) {
            console.log('[CRON] ✨ No rooms needed auto-eviction today.');
        } else {
            console.log(`[CRON] ✅ Auto-evicted ${evictedCount} rooms.`);
        }
    });
}

/**
 * สร้างและส่งรายงานระบบ (ใช้ได้ทั้ง Cronjob และ On-Demand)
 */
async function generateAndSendReport(db, googleNotifier, pbx) {
    return new Promise((resolve, reject) => {
        // 1. ดึงข้อมูลห้องทั้งหมดจาก DB
        db.getAllRooms((err, rooms) => {
            if (err) {
                console.error('[CRON] ❌ Error fetching rooms:', err.message);
                if (googleNotifier) {
                    googleNotifier.sendSystemAlert('Daily Report Error', `Failed to fetch database: ${err.message}`, true);
                }
                return reject(err);
            }

            const totalRooms = rooms.length;
            const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
            const vacantRooms = totalRooms - occupiedRooms;
            const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : 0;
            
            // 2. ดึงสถิติจริงประจำวันจากตาราง approval_audit_events
            const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
            
            const checkinsQuery = `SELECT COUNT(*) AS count FROM approval_audit_events WHERE command_type = 'ROOM_ON' AND date(timestamp, 'localtime') = ?`;
            const checkoutsQuery = `SELECT COUNT(*) AS count FROM approval_audit_events WHERE command_type = 'ROOM_OFF' AND date(timestamp, 'localtime') = ?`;
            const errorsQuery = `SELECT COUNT(*) AS count FROM approval_audit_events WHERE payload_json LIKE '%"error":%' AND date(timestamp, 'localtime') = ?`;

            db.db.get(checkinsQuery, [todayStr], (err1, rowCheckins) => {
                if (err1) console.error('[CRON] Failed to query checkins:', err1.message);
                const checkinsToday = rowCheckins ? rowCheckins.count : 0;

                db.db.get(checkoutsQuery, [todayStr], (err2, rowCheckouts) => {
                    if (err2) console.error('[CRON] Failed to query checkouts:', err2.message);
                    const checkoutsToday = rowCheckouts ? rowCheckouts.count : 0;

                    db.db.get(errorsQuery, [todayStr], (err3, rowErrors) => {
                        if (err3) console.error('[CRON] Failed to query errors:', err3.message);
                        const errorsToday = rowErrors ? rowErrors.count : 0;

                        // ตรวจสอบสถานะ PBX
                        const pbxStatusStr = pbx ? '🟢 Online (Active)' : '🔴 Offline (Disconnected)';
                        const pbxModeStr = pbx ? pbx.mode : 'Unknown';

                        // 3. จัดทำรายงานข้อความภาษาไทย
                        let reportMessage = `<b>สถานะตู้สาขา (PBX):</b> ${pbxStatusStr}<br>`;
                        reportMessage += `<b>โหมดการเชื่อมต่อ:</b> ${pbxModeStr}<br><br>`;
                        reportMessage += `<b>📊 สถิติการปฏิบัติงานวันนี้ (${todayStr}):</b><br>`;
                        reportMessage += `- ยอดเช็คอิน (Check-In): <b>${checkinsToday} รายการ</b><br>`;
                        reportMessage += `- ยอดเช็คเอาท์ (Check-Out): <b>${checkoutsToday} รายการ</b><br>`;
                        reportMessage += `- ฮาร์ดแวร์ขัดข้อง/Error: <b>${errorsToday} ครั้ง</b><br><br>`;
                        reportMessage += `<b>🏨 สรุปยอดห้องพักปัจจุบัน:</b><br>`;
                        reportMessage += `- ห้องพักทั้งหมด: ${totalRooms} ห้อง<br>`;
                        reportMessage += `- มีแขกเข้าพัก (Occupied): ${occupiedRooms} ห้อง<br>`;
                        reportMessage += `- ว่าง (Vacant): ${vacantRooms} ห้อง<br>`;
                        reportMessage += `- อัตราการเข้าพัก (Occupancy): <b>${occupancyRate}%</b>`;

                        // 4. ส่งข้อมูลลง Google Sheets Webhook (ถ้าเปิดใช้งาน)
                        if (googleNotifier && googleNotifier.isSheetsActive()) {
                            const sheetsPayload = {
                                action: 'DailyReport',
                                date: todayStr,
                                checkins: checkinsToday,
                                checkouts: checkoutsToday,
                                errorCount: errorsToday,
                                occupancyRate: parseFloat(occupancyRate),
                                occupiedRooms: occupiedRooms
                            };
                            
                            // ใช้ _sendToSheets ของ googleNotifier
                            googleNotifier._sendToSheets(sheetsPayload);
                        }

                        // 5. ส่งการแจ้งเตือนเข้า Google Chat Card
                        if (googleNotifier) {
                            googleNotifier.sendSystemAlert('📊 Daily Operations Report', reportMessage, false);
                            console.log('[CRON] ✅ Daily operations report sent to Google Chat.');
                        } else {
                            console.log('[CRON] ⚠️ Google Notifier not available. Report:', reportMessage);
                        }

                        resolve({
                            date: todayStr,
                            pbx: {
                                status: pbx ? 'active' : 'disconnected',
                                mode: pbxModeStr
                            },
                            stats: {
                                checkins: checkinsToday,
                                checkouts: checkoutsToday,
                                errors: errorsToday
                            },
                            occupancy: {
                                total: totalRooms,
                                occupied: occupiedRooms,
                                vacant: vacantRooms,
                                rate: occupancyRate
                            },
                            timestamp: new Date().toISOString()
                        });
                    });
                });
            });
        });
    });
}

module.exports = {
    startCronJobs,
    generateAndSendReport
};
