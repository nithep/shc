# Hotel-ECS Backend API - ตัวอย่างการใช้งาน

เอกสารนี้มีตัวอย่างการใช้งาน API ทั้งหมดของระบบ Hotel-ECS

## 📋 สารบัญ
1. [Health Check & Documentation](#health-check--documentation)
2. [Authentication](#authentication)
3. [PDPA Compliance](#pdpa-compliance)
4. [Room Management](#room-management)
5. [Check-in/Check-out](#check-incheck-out)
6. [Admin Operations](#admin-operations)
7. [External API](#external-api)
8. [Monitoring & Diagnostics](#monitoring--diagnostics)

---

## Health Check & Documentation

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "services": {
    "pbx": {
      "mode": "tcp",
      "state": "CONNECTED",
      "connected": true
    },
    "database": "sqlite",
    "authentication": "JWT + API Key",
    "pdpa": "compliant",
    "rateLimiting": "enabled",
    "approvalGate": "enabled"
  }
}
```

### 2. API Documentation
```bash
curl http://localhost:3000/api/docs
```

---

## Authentication

### 1. Staff Login (Front Desk)
```bash
curl -X POST http://localhost:3000/api/auth/verify-pin \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "1234"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "front_desk"
}
```

### 2. Owner Login
```bash
curl -X POST http://localhost:3000/api/auth/verify-pin \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "9999"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "owner"
}
```

### 3. ใช้ Token ใน Requests
```bash
export TOKEN="your_jwt_token_here"

curl http://localhost:3000/api/rooms \
  -H "Authorization: Bearer $TOKEN"
```

---

## PDPA Compliance

### 1. ดู Privacy Policy
```bash
curl http://localhost:3000/api/pdpa/privacy-policy
```

**Response:**
```json
{
  "success": true,
  "policy": "\nนโยบายความเป็นส่วนตัว (Privacy Policy)...\n",
  "version": "1.0",
  "lastUpdated": "2025-01-01"
}
```

### 2. บันทึก Consent ก่อน Check-in
```bash
curl -X POST http://localhost:3000/api/pdpa/consent \
  -H "Content-Type: application/json" \
  -d '{
    "guestName": "สมชาย ใจดี",
    "guestEmail": "somchai@example.com",
    "roomNumber": "101",
    "privacyPolicyAccepted": true,
    "acceptedAt": "2025-01-15T10:30:00.000Z"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Consent recorded successfully",
  "consentHash": "a1b2c3d4e5f6g7h8",
  "acceptedAt": "2025-01-15T10:30:00.000Z"
}
```

### 3. ตรวจสอบ Consent Audit Trail (Owner Only)
```bash
curl http://localhost:3000/api/pdpa/audit?room_number=101 \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "records": [
    {
      "id": 1,
      "guest_name": "สมชาย ใจดี",
      "guest_email": "s***@example.com",
      "room_number": "101",
      "ip_address": "192.168.1.100",
      "accepted_at": "2025-01-15T10:30:00.000Z",
      "consent_hash": "a1b2c3d4e5f6g7h8"
    }
  ]
}
```

### 4. DSAR - ขอข้อมูลส่วนบุคคล
```bash
curl "http://localhost:3000/api/pdpa/data-access?guestName=สมชาย" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "dataSubject": {
    "guestName": "สมชาย ใจดี",
    "roomNumber": null
  },
  "consentRecords": [...],
  "roomHistory": [...],
  "totalRecords": 10,
  "note": "This is your personal data under PDPA Section 30..."
}
```

### 5. ลบข้อมูลส่วนบุคคล (Right to be Forgotten)
```bash
curl -X DELETE http://localhost:3000/api/pdpa/data \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "guestName": "สมชาย ใจดี",
    "olderThanDays": 365
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Personal data deleted/anonymized successfully",
  "deletedConsentRecords": 5,
  "anonymizedRoomRecords": 3
}
```

### 6. ถอนความยินยอม
```bash
curl -X POST http://localhost:3000/api/pdpa/withdraw \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "consentHash": "a1b2c3d4e5f6g7h8",
    "reason": "Guest requested withdrawal"
  }'
```

---

## Room Management

### 1. ดูรายการห้องทั้งหมด (Public - Anonymized)
```bash
curl http://localhost:3000/api/rooms
```

**Response (Public):**
```json
{
  "success": true,
  "rooms": [
    {
      "id": 101,
      "status": "occupied",
      "power": true
    }
  ],
  "role": "public"
}
```

### 2. ดูรายการห้อง (Staff - Masked Data)
```bash
curl http://localhost:3000/api/rooms \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

**Response (Staff):**
```json
{
  "success": true,
  "rooms": [
    {
      "id": 101,
      "status": "occupied",
      "power": true,
      "guest_name": "ส***",
      "guest_email": "s***@example.com",
      "checkin_date": "2025-01-15T10:00:00.000Z",
      "checkout_date": "2025-01-16T12:00:00.000Z"
    }
  ],
  "role": "front_desk"
}
```

### 3. ดูสถานะห้องจาก PBX
```bash
curl http://localhost:3000/api/rooms/101/status \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

### 4. ต่ออายุการเข้าพัก
```bash
curl -X POST http://localhost:3000/api/rooms/101/extend \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "days": 2
  }'
```

---

## Check-in/Check-out

### 1. Check-in พร้อม PDPA Consent
```bash
curl -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "guestName": "สมชาย ใจดี",
    "guestEmail": "somchai@example.com",
    "days": 2,
    "pdpaConsent": {
      "privacyPolicyAccepted": true,
      "acceptedAt": "2025-01-15T10:30:00.000Z"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Check-in successful",
  "trace_id": "uuid-here",
  "hardware_status": {
    "success": true,
    "status": "ACK"
  },
  "token": "guest_jwt_token_here",
  "pdpaCompliant": true
}
```

### 2. Check-in แบบ Dry Run (ทดสอบ)
```bash
curl -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "guestName": "ทดสอบ ระบบ",
    "dryRun": true,
    "pdpaConsent": {
      "privacyPolicyAccepted": true,
      "acceptedAt": "2025-01-15T10:30:00.000Z"
    }
  }'
```

### 3. Check-out (Guest - ห้องตัวเองเท่านั้น)
```bash
curl -X POST http://localhost:3000/api/checkout \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101"
  }'
```

### 4. Check-out (Staff)
```bash
curl -X POST http://localhost:3000/api/checkout \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101"
  }'
```

### 5. ควบคุมไฟในห้อง (Guest)
```bash
curl -X POST http://localhost:3000/api/rooms/guest-control \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "ON"
  }'
```

หรือปิดไฟ:
```bash
curl -X POST http://localhost:3000/api/rooms/guest-control \
  -H "Authorization: Bearer $GUEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "OFF"
  }'
```

---

## Admin Operations

### 1. ดูคำขออนุมัติคำสั่ง
```bash
curl http://localhost:3000/api/admin/approval \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 2. อนุมัติคำสั่ง
```bash
curl -X POST http://localhost:3000/api/admin/approval/approval-id-here/approve \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "อนุมัติเพื่อทดสอบระบบ",
    "decidedBy": "admin:nithep"
  }'
```

### 3. ปฏิเสธคำสั่ง
```bash
curl -X POST http://localhost:3000/api/admin/approval/approval-id-here/reject \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "ไม่ปลอดภัยในช่วงเวลานี้"
  }'
```

### 4. ดำเนินการคำสั่งที่อนุมัติแล้ว
```bash
curl -X POST http://localhost:3000/api/admin/approval/approval-id-here/execute \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 5. จัดการ API Keys

#### สร้าง API Key ใหม่
```bash
curl -X POST http://localhost:3000/api/admin/apikeys \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My PMS System"
  }'
```

**Response:**
```json
{
  "success": true,
  "key": {
    "id": "key_123456",
    "name": "My PMS System",
    "apiKey": "sk_live_xxxxxxxxxxxx",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "active": true
  }
}
```

#### ดูรายการ API Keys
```bash
curl http://localhost:3000/api/admin/apikeys \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

#### ลบ API Key
```bash
curl -X DELETE http://localhost:3000/api/admin/apikeys/key_123456 \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 6. ดู Audit Logs
```bash
curl http://localhost:3000/api/audit/events?limit=50 \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

#### กรองตาม trace ID
```bash
curl "http://localhost:3000/api/audit/events?trace_id=uuid-here" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

#### ลบ Audit Logs ทั้งหมด
```bash
curl -X DELETE http://localhost:3000/api/audit/events \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 7. บังคับควบคุมห้อง (Force Control)
```bash
curl -X POST http://localhost:3000/api/rooms/control \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "action": "ON",
    "source": "manual_override"
  }'
```

---

## External API

### 1. External Check-in (ใช้ API Key)
```bash
curl -X POST http://localhost:3000/api/v1/external/checkin \
  -H "X-API-Key: sk_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "guestName": "John Doe",
    "guestEmail": "john@example.com",
    "pdpaConsentHandled": true
  }'
```

**สำคัญ:** External systems ต้องยืนยันว่าได้ขอ consent จากแขกแล้วโดยตั้ง `pdpaConsentHandled: true`

### 2. External Checkout
```bash
curl -X POST http://localhost:3000/api/v1/external/checkout \
  -H "X-API-Key: sk_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101"
  }'
```

### 3. External Dry Run
```bash
curl -X POST http://localhost:3000/api/v1/external/checkin \
  -H "X-API-Key: sk_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "guestName": "Test User",
    "dryRun": true
  }'
```

---

## Monitoring & Diagnostics

### 1. System Diagnostics
```bash
curl http://localhost:3000/api/diagnostics/health \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "report": {
    "pbx": {
      "status": "green",
      "details": "Connected and responding"
    },
    "network": {
      "status": "green",
      "details": "Internet connection OK"
    },
    "database": {
      "status": "green",
      "details": "Database accessible"
    }
  }
}
```

### 2. AI Copilot Chat
```bash
curl -X POST http://localhost:3000/api/diagnostics/copilot \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "ห้อง 101 ไฟไม่ติด ต้องทำยังไง?",
    "history": []
  }'
```

**Response:**
```json
{
  "success": true,
  "reply": "จากการตรวจสอบระบบ พบว่า...\n\nขั้นตอนการแก้ไข:\n1. ตรวจสอบสถานะ PBX...\n2. ..."
}
```

### 3. Real-time Telemetry (SSE)
```javascript
// JavaScript Example
const eventSource = new EventSource('http://localhost:3000/api/telemetry/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Telemetry:', data);
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
};
```

### 4. Generate System Report
```bash
curl http://localhost:3000/api/system/report \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

---

## WiFi Management (Owner Only)

### 1. ดูสถานะ WiFi
```bash
curl http://localhost:3000/api/wifi/status \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 2. สแกนเครือข่าย WiFi
```bash
curl http://localhost:3000/api/wifi/scan \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 3. เชื่อมต่อ WiFi
```bash
curl -X POST http://localhost:3000/api/wifi/connect \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ssid": "MyWiFiNetwork",
    "password": "password123"
  }'
```

### 4. ตัดการเชื่อมต่อ WiFi
```bash
curl -X POST http://localhost:3000/api/wifi/disconnect \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### 5. เปิด/ปิด WiFi
```bash
curl -X POST http://localhost:3000/api/wifi/toggle \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

---

## Error Handling

### Rate Limit Exceeded (429)
```json
{
  "blocked": true,
  "reason": "RATE_LIMITED",
  "message": "ห้อง 101 ส่งคำสั่งเกินขีดจำกัด (3 ครั้ง/นาที)",
  "resetAt": "2025-01-15T10:31:00.000Z"
}
```

### Approval Required (202)
```json
{
  "blocked": true,
  "reason": "APPROVAL_REQUIRED",
  "approvalId": "approval-uuid-here",
  "classification": {
    "riskCode": "ALL_ROOM_ON",
    "riskName": "เปิดไฟทุกห้อง"
  },
  "message": "คำสั่งเสี่ยงสูง — ต้องได้รับอนุมัติจากแอดมินก่อน"
}
```

### Invalid Consent (400)
```json
{
  "error": "Invalid PDPA consent",
  "details": ["You must accept the Privacy Policy"],
  "privacyPolicyUrl": "/api/pdpa/privacy-policy"
}
```

### Unauthorized (401/403)
```json
{
  "error": "Access token is required"
}
```

หรือ

```json
{
  "error": "Access denied: Staff/Owner authorization required"
}
```

---

## Best Practices

### 1. Always Handle PDPA Consent
```javascript
// ✅ ดี - มี consent
const response = await fetch('/api/checkin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    roomNumber: '101',
    guestName: 'สมชาย',
    pdpaConsent: {
      privacyPolicyAccepted: true,
      acceptedAt: new Date().toISOString()
    }
  })
});

// ❌ ไม่ดี - ไม่มี consent
fetch('/api/checkin', {
  method: 'POST',
  body: JSON.stringify({
    roomNumber: '101',
    guestName: 'สมชาย'
    // ขาด pdpaConsent!
  })
});
```

### 2. Use Dry Run for Testing
```bash
# ทดสอบก่อนใช้งานจริง
curl -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "101",
    "guestName": "ทดสอบ",
    "dryRun": true,
    "pdpaConsent": {
      "privacyPolicyAccepted": true,
      "acceptedAt": "2025-01-15T10:30:00.000Z"
    }
  }'
```

### 3. Store Tokens Securely
```javascript
// Frontend - ใช้ httpOnly cookies หรือ secure storage
localStorage.setItem('token', token); // ⚠️ ไม่แนะนำสำหรับ production

// หรือใช้ httpOnly cookies (ดีกว่า)
document.cookie = `token=${token}; HttpOnly; Secure; SameSite=Strict`;
```

### 4. Handle Errors Gracefully
```javascript
try {
  const response = await fetch('/api/checkin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(checkinData)
  });

  if (response.status === 429) {
    // Rate limited - wait and retry
    const data = await response.json();
    const waitTime = new Date(data.resetAt) - Date.now();
    setTimeout(() => retry(), waitTime);
  } else if (response.status === 202) {
    // Approval required
    showApprovalPendingMessage(data.approvalId);
  } else if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
} catch (error) {
  console.error('Check-in failed:', error);
  showErrorMessage(error.message);
}
```

---

## Security Checklist

- ✅ ใช้ HTTPS ใน production
- ✅ เก็บ JWT_SECRET และ API keys ใน environment variables
- ✅ ตั้งค่า CORS ให้ถูกต้อง
- ✅ ใช้ rate limiting
- ✅ ตรวจสอบ PDPA consent ทุกครั้ง
- ✅ บันทึก audit logs
- ✅ หมุนเวียน API keys เป็นประจำ
- ✅ ใช้ strong PIN codes สำหรับ staff
- ✅ จำกัดสิทธิ์ตาม role (RBAC)
- ✅ ทำ data anonymization ตาม PDPA

---

## Troubleshooting

### ปัญหา: Token หมดอายุ
```bash
# แก้ไข: Login ใหม่เพื่อรับ token ใหม่
curl -X POST http://localhost:3000/api/auth/verify-pin \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'
```

### ปัญหา: Rate Limit Exceeded
```bash
# แก้ไข: รอ 60 วินาที หรือติดต่อ owner เพื่อเพิ่ม limit
# ตรวจสอบสถานะ rate limit ใน response headers
```

### ปัญหา: Approval Required
```bash
# แก้ไข: Owner ต้อง approve คำสั่ง
# 1. ดู pending approvals
curl http://localhost:3000/api/admin/approval \
  -H "Authorization: Bearer $OWNER_TOKEN"

# 2. Approve คำสั่ง
curl -X POST http://localhost:3000/api/admin/approval/{id}/approve \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Approved for testing"}'

# 3. Execute คำสั่ง
curl -X POST http://localhost:3000/api/admin/approval/{id}/execute \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

### ปัญหา: PBX Connection Lost
```bash
# ตรวจสอบสถานะ
curl http://localhost:3000/api/health

# ดู diagnostics
curl http://localhost:3000/api/diagnostics/health \
  -H "Authorization: Bearer $STAFF_TOKEN"

# ระบบจะ auto-reconnect ทุก 60 วินาทีอัตโนมัติ
```

---

## Additional Resources

- [Backend README](README.md) - เอกสาร backend เต็มรูปแบบ
- [Telegram Bot Setup](README_TELEGRAM.md) - วิธีตั้งค่า Telegram bot
- [Main Project README](../README.md) - เอกสารโครงการหลัก

---

**หมายเหตุ:** 
- เปลี่ยน `localhost:3000` เป็น IP หรือ domain ของเซิร์ฟเวอร์จริงใน production
- ใช้ HTTPS เสมอใน production
- เก็บ secrets (.env) ให้ปลอดภัยและไม่ commit ขึ้น Git
