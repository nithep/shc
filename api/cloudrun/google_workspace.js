/**
 * google_workspace.js
 * 
 * โมดูลสำหรับเชื่อมต่อระบบ Hotel ECS เข้ากับ Ecosystem ของ Google Workspace
 * รวมถึงระบบแจ้งเตือน Financial Alerts ผ่าน LINE Notify ตามที่คุณลูกค้าขอ
 */

const axios = require('axios');

// Placeholder สำหรับ credentials (ในการรันจริงต้องใช้ Service Account JSON ของ GCP)
const GOOGLE_API_CREDENTIALS = process.env.GOOGLE_API_CREDENTIALS;
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;

/**
 * ซิงค์ข้อมูลการจองลง Google Calendar เพื่อป้องกันห้องซ้ำ
 * @param {string} roomNumber เลขห้อง
 * @param {string} guestName ชื่อแขก
 * @param {Date} checkInTime เวลาเช็คอิน
 * @param {Date} checkOutTime เวลาเช็คเอาท์
 */
async function syncToCalendar(roomNumber, guestName, checkInTime, checkOutTime) {
  console.log(`[Google Calendar] Mock syncing Room ${roomNumber} (${guestName}) to Calendar.`);
  console.log(`Check-in: ${checkInTime}, Check-out: ${checkOutTime}`);
  // Implementation note: 
  // 1. Authenticate with GoogleAuth using Service Account
  // 2. call calendar.events.insert()
  return true;
}

/**
 * บันทึกประวัติการเงิน (รายรับ/รายจ่าย) ลง Google Sheets
 * @param {number} amount ยอดเงิน
 * @param {string} type 'INCOME' หรือ 'EXPENSE'
 * @param {string} description รายละเอียด
 */
async function recordFinancialTransaction(amount, type, description) {
  console.log(`[Google Sheets] Mock recording ${type}: ${amount} THB - ${description}`);
  // Implementation note:
  // 1. Authenticate with GoogleAuth
  // 2. call sheets.spreadsheets.values.append() to log the transaction
  return true;
}

/**
 * ตรวจสอบรายจ่ายสำคัญที่กำลังจะถึงกำหนด และเตือนเข้า LINE Notify
 * ป้องกันปัญหาระบบถูกตัดเพราะลืมจ่ายเงิน (Server, API Token, ค่าน้ำไฟ)
 */
async function checkTokenAndAlert() {
  console.log(`[Financial Alert] Checking upcoming bills from Google Sheets...`);
  
  // สมมติว่าดึงข้อมูลจาก Sheet แล้วพบว่าใกล้ถึงวันจ่ายค่า Server
  const upcomingBills = [
    { name: "Google Cloud Run / Vertex AI Bill", dueDate: "2026-07-30", amount: 450.00 }
  ];

  if (upcomingBills.length > 0) {
    for (const bill of upcomingBills) {
      const message = `\n⚠️ [แจ้งเตือนรายจ่ายสำคัญ] ⚠️\n` +
                      `รายการ: ${bill.name}\n` +
                      `กำหนดชำระ: ${bill.dueDate}\n` +
                      `ยอด: ${bill.amount} บาท\n` +
                      `กรุณาชำระเพื่อป้องกันระบบถูกระงับ!`;
                      
      await sendLineNotify(message);
    }
  }
}

/**
 * ส่งข้อความเตือนเข้า LINE Notify
 * @param {string} message ข้อความแจ้งเตือน
 */
async function sendLineNotify(message) {
  if (!LINE_NOTIFY_TOKEN) {
    console.log(`[LINE Notify] Token not set. Would have sent: ${message}`);
    return;
  }

  try {
    await axios.post(
      'https://notify-api.line.me/api/notify',
      `message=${encodeURIComponent(message)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`
        }
      }
    );
    console.log(`[LINE Notify] Message sent successfully.`);
  } catch (error) {
    console.error(`[LINE Notify] Failed to send message:`, error.message);
  }
}

module.exports = {
  syncToCalendar,
  recordFinancialTransaction,
  checkTokenAndAlert,
  sendLineNotify
};
