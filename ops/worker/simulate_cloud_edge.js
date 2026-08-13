/**
 * จำลองการทำงาน (Simulation) สถาปัตยกรรม Cloud-Edge
 * 
 * สคริปต์นี้จำลองการสื่อสารผ่าน MQTT โดยใช้ public broker (broker.hivemq.com)
 * 1. โหลด Backend MQTT Connector (สมอง)
 * 2. โหลด Edge Agent MQTT (แขนขา)
 * 3. ส่งคำสั่ง Check-in / Check-out และดูผลลัพธ์
 */

require('dotenv').config();
const mqtt = require('mqtt');
const { createConnector } = require('../api/services/mqtt_connector');
const { createConnector: createPbxConnector } = require('../edge-agent/index');

// ใช้ Public MQTT Broker สำหรับการจำลอง
const TEST_BROKER = 'mqtt://broker.hivemq.com:1883';
const BRANCH_ID = 'test_branch_999';

console.log('=====================================================');
console.log('🌐 เริ่มต้นการทดสอบ Cloud-Native & Edge Computing');
console.log('=====================================================\n');

async function runSimulation() {
    console.log('[1] 🚀 กำลังเตรียม Edge Agent (แขนขา)...');
    
    // จำลอง Edge Agent
    const edgePbx = createPbxConnector({ mode: 'mock', heartbeatInterval: 0 });
    await edgePbx.connect();
    
    const edgeMqtt = mqtt.connect(TEST_BROKER, { clientId: `edge-${BRANCH_ID}-${Date.now()}` });
    
    edgeMqtt.on('connect', () => {
        console.log('   [Edge] ✅ เชื่อมต่อกับ MQTT Broker สำเร็จ');
        edgeMqtt.subscribe(`hotel/${BRANCH_ID}/room/+/command`);
        edgeMqtt.publish(`hotel/${BRANCH_ID}/status`, JSON.stringify({ status: 'online' }));
    });

    edgeMqtt.on('message', async (topic, message) => {
        console.log(`\n   [Edge] 📥 ได้รับคำสั่งจาก Cloud: ${topic}`);
        const payload = JSON.parse(message.toString());
        const roomNo = topic.split('/')[3];
        
        console.log(`   [Edge] ⚙️ กำลังส่งคำสั่ง ${payload.command} ไปยังตู้สาขา (Mock PBX) ห้อง ${roomNo}...`);
        
        try {
            if (payload.command === 'ON') {
                await edgePbx.checkIn(roomNo, payload.guestName);
            } else {
                await edgePbx.checkOut(roomNo);
            }
            
            // ส่งผลลัพธ์กลับไปยัง Cloud
            console.log(`   [Edge] ✅ ทำงานสำเร็จ! ส่งสถานะกลับไปยัง Cloud`);
            edgeMqtt.publish(`hotel/${BRANCH_ID}/room/${roomNo}/result`, JSON.stringify({ command: payload.command, status: 'success' }));
        } catch (err) {
            console.error(`   [Edge] ❌ ข้อผิดพลาด:`, err.message);
        }
    });

    // รอให้ Edge พร้อม
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n[2] 🧠 กำลังเตรียม Cloud Backend (สมอง)...');
    
    // ตั้งค่า Environment เพื่อให้ Backend เชื่อมไปยัง Public Broker
    process.env.MQTT_BROKER_URL = TEST_BROKER;
    process.env.BRANCH_ID = BRANCH_ID;
    
    const cloudBackend = createConnector();
    
    cloudBackend.on('reconnected', () => {
        console.log('   [Cloud] ✅ เชื่อมต่อกับ MQTT Broker สำเร็จ');
    });

    cloudBackend.on('heartbeat', () => {
         console.log('   [Cloud] 💓 ได้รับสถานะ Online จาก Edge Agent');
    });

    cloudBackend.on('checkin', (data) => {
        console.log(`\n   [Cloud] 🔔 ได้รับคำยืนยัน: เช็คอินห้อง ${data.room} สำเร็จ (Status: ${data.status})`);
        
        // ทดสอบ Check-out ต่อ
        console.log('\n[4] 🧠 Cloud สั่ง Check-out ห้อง 101...');
        cloudBackend.checkOut('101');
    });

    cloudBackend.on('checkout', (data) => {
        console.log(`\n   [Cloud] 🔔 ได้รับคำยืนยัน: เช็คเอาท์ห้อง ${data.room} สำเร็จ (Status: ${data.status})`);
        
        console.log('\n=====================================================');
        console.log('🎉 การทดสอบเสร็จสมบูรณ์! ระบบสื่อสารผ่านคลาวด์ทำงานได้จริง');
        console.log('=====================================================');
        
        setTimeout(() => process.exit(0), 1000);
    });

    await cloudBackend.connect();

    // รอสักครู่แล้วเริ่มการจำลอง Check-in
    setTimeout(() => {
        console.log('\n[3] 🧠 Cloud สั่ง Check-in ห้อง 101 (คุณสมเกียรติ)...');
        cloudBackend.checkIn('101', 'คุณสมเกียรติ');
    }, 2000);
}

runSimulation().catch(console.error);
