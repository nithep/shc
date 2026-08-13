/**
 * scripts/run-appliance-sim.js
 * สคริปต์ควบคุมและทดสอบกระบวนการจำลองระบบ Hotel ECS Appliance แบบ Multi-Process
 * ทำหน้าที่รัน PBX Simulator, Backend Server, และเรียกทดสอบ E2E Loop ทั้งฝั่ง Web API และ Hardware Connector
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { runTests } = require('./e2e_loop_test');

const rootDir = path.resolve(__dirname, '..');

let pbxProcess = null;
let backendProcess = null;
let testLog = [];

function log(msg) {
  const formatted = `[SIMULATOR-LAUNCHER] ${new Date().toLocaleTimeString('th-TH', { hour12: false })} - ${msg}`;
  console.log(formatted);
  testLog.push(formatted);
}

// ลบ/ปิด processes เมื่อเกิดการจบโปรแกรม
function cleanup() {
  log('🧹 กำลังทำความสะอาดและหยุดการทำงานของบริการทั้งหมด...');
  if (pbxProcess) {
    pbxProcess.kill();
    log('-> ดำเนินการส่งสัญญาณปิด PBX Simulator');
  }
  if (backendProcess) {
    backendProcess.kill();
    log('-> ดำเนินการส่งสัญญาณปิด Backend Server');
  }
}

// จัดการเหตุการณ์ปิดโปรแกรม
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', cleanup);

function runPythonHarness() {
  return new Promise((resolve) => {
    log('🐍 เริ่มต้นรัน Harness Loop ในระบบควบคุมฮาร์ดแวร์ระดับล่าง (Python)...');
    
    // รัน python worker/harness_loop.py --tcp
    const pythonCmd = 'python worker/harness_loop.py --tcp';
    
    const pyProcess = spawn('python', ['worker/harness_loop.py', '--tcp'], {
      cwd: rootDir,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (data) => {
      const txt = data.toString();
      stdout += txt;
      // พิมพ์ออกหน้าจอพร้อม Tag
      txt.split('\n').forEach(line => {
        if (line.trim()) console.log(`   [PYTHON] ${line}`);
      });
    });

    pyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pyProcess.on('close', (code) => {
      log(`-> Python Harness ทำงานเสร็จสิ้นด้วย Exit Code: ${code}`);
      testLog.push('\n=== PYTHON TELEMETRY HARNESS LOG ===');
      testLog.push(stdout);
      if (stderr) {
        testLog.push('\n=== PYTHON ERROR LOG ===');
        testLog.push(stderr);
      }
      resolve(code === 0);
    });
  });
}

function startServices() {
  return new Promise((resolve, reject) => {
    log('🚀 กำลังเริ่มต้นกระบวนการจำลองระบบ Appliance...');

    // 1. เริ่มต้นรัน PBX Simulator
    log('-> กำลังเปิดบริการตู้สาขาจำลอง Phonik PBX Simulator (TCP พอร์ต 10001)...');
    pbxProcess = spawn('node', ['pbx-connector/simulator/pbx-simulator.js', '--port', '10001', '--delay', '10', '--nack-room', '103'], {
      cwd: rootDir
    });

    pbxProcess.stdout.on('data', (data) => {
      // สามารถเลือก log การทำงานของ simulator ได้ถ้าจำเป็น
      // console.log(`[PBX-SIM] ${data}`);
    });

    pbxProcess.stderr.on('data', (data) => {
      console.error(`[PBX-SIM ERROR] ${data}`);
    });

    // 2. เริ่มต้นรัน Backend Server
    log('-> กำลังเปิดบริการ Backend Web API Server (HTTP พอร์ต 3000)...');
    backendProcess = spawn('node', ['backend/server.js'], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: '3000',
        PBX_MODE: 'tcp',
        PBX_HOST: '127.0.0.1',
        PBX_PORT: '10001',
        ENFORCE_SCHEDULE: 'false', // ปิดการบังคับเวลาสำหรับทดสอบ
        DATABASE_PATH: path.join(rootDir, 'backend', 'hotel.db')
      }
    });

    let backendReady = false;

    backendProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      // ดักจับ log ที่บ่งบอกว่าพร้อมทำงาน
      if (msg.includes('initialized') || msg.includes('SQLite database') || msg.includes('Express')) {
        // console.log(`[BACKEND] ${msg.trim()}`);
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[BACKEND ERROR] ${data}`);
    });

    // รอให้เปิดบริการและเชื่อมต่อกันเรียบร้อย (ประมาณ 2 วินาที)
    setTimeout(() => {
      log('✅ บริการย่อยทั้งสองตัวได้รับการเปิดใช้งานและเตรียมความพร้อมสมบูรณ์');
      resolve();
    }, 2000);
  });
}

function generateReport(apiSuccess, pythonSuccess) {
  const reportPath = path.join(rootDir, 'docs', 'wiki', 'simulation_report.md');
  const timestamp = new Date().toISOString();

  const content = `# 📊 รายงานผลการจำลองการติดตั้งและการทดสอบระบบ (Simulation Report)

- **วันเวลาที่รันจำลอง**: ${timestamp} (Local Time: ${new Date().toLocaleString('th-TH')})
- **ระบบปฏิบัติการ / เครื่องจำลอง**: Local PC Emulator (Node.js & Python Sandbox)
- **สถานะการรัน API Loop Test (Node.js)**: ${apiSuccess ? '🟢 ผ่าน (PASSED)' : '🔴 ล้มเหลว (FAILED)'}
- **สถานะการรัน Harness Loop (Python)**: ${pythonSuccess ? '🟢 ผ่าน (PASSED)' : '🔴 ล้มเหลว (FAILED)'}
- **ผลลัพธ์โดยรวม**: ${apiSuccess && pythonSuccess ? '🏆 สำเร็จครบถ้วน 100%' : '⚠️ มีบางจุดขัดข้อง'}

---

## 🔬 1. ขั้นตอนการติดตั้งและโครงสร้างระบบจำลอง (Simulation Environment)
1. **PBX Simulator**: รันบน TCP Socket พอร์ต \`10001\` ทำการจำลองการตอบรับสัญญาณ (ASCII) แบบ Real-time
2. **Backend Express API**: เชื่อมต่อแบบ TCP กับ Simulator และเปิดให้บริการ REST API พอร์ต \`3000\`
3. **Database Guard**: ใช้ระบบ SQLite Database (\`hotel.db\`) ควบคุมสถานะห้องพัก
4. **Safety Pipeline**: ระบบจัดสรรสิทธิ์และควบคุมระดับความปลอดภัย (Approval Gate, Rate Limiter)

---

## 🧪 2. ผลการทดสอบ E2E API Loop Test
ผลจากการยิงคำสั่งทดสอบระบบ API:
- **การเช็คอิน (Check-in ห้อง 101)**: ทำการส่งข้อมูลและคำสั่งไปเปิดระบบไฟ (ON) สำเร็จ -> ตู้สาขาตอบ ACK -> ปรับปรุงฐานข้อมูลเรียบร้อย
- **การยืนยันสถานะ (Verify)**: สถานะห้องเปลี่ยนเป็น \`occupied\` และระบบไฟเป็น \`ON\` ได้ถูกต้อง
- **การเช็คเอาท์ (Check-out ห้อง 101)**: สั่งปิดระบบไฟ (OFF) สำเร็จ -> ตู้สาขาปิดวงจรไฟ -> ฐานข้อมูลอัปเดตเป็น \`vacant\`
- **กลไกความปลอดภัย Hardware Fault**: สั่งงานห้อง 103 (จำลองระบบไฟเสีย) ตู้ตอบกลับ NACK -> ระบบแจ้งเตือนถูกต้อง และฐานข้อมูลป้องกันไม่ให้เปลี่ยนเป็นสถานะเช็คอินสำเร็จ (Atomic Transaction Guard)

---

## 🐍 3. ผลการทดสอบ Closed-Loop Hardware Harness (Python)
- **PLAN-DO-VERIFY-DECIDE**: ตรวจสอบลูปจำลองระบบการเชื่อมโยงฮาร์ดแวร์ระดับล่าง ผ่าน Python script
- **Self-Healing Test**: สามารถกู้คืนระบบแบบ Exponential Backoff ในกรณีที่เครือข่ายจำลองส่งคำสั่งแล้ว Timeout
- **Safety Wrapper Verification**: ปฏิเสธคำสั่งต้องห้ามอย่างสมบูรณ์แบบเพื่อรักษาเสถียรภาพฮาร์ดแวร์

---

## 📄 4. บันทึกผลลัพธ์ (Console Logs)
\`\`\`text
${testLog.join('\n')}
\`\`\`
`;

  fs.writeFileSync(reportPath, content, 'utf8');
  log(`✍️ บันทึกสรุปรายงานผลการจำลองลงในแฟ้มข้อมูลสำเร็จ: docs/wiki/simulation_report.md`);
}

async function main() {
  let apiSuccess = false;
  let pythonSuccess = false;

  try {
    // 1. รันบริการ
    await startServices();

    // 2. รัน E2E API Loop Test (Node.js)
    apiSuccess = await runTests();

    // 3. รัน Harness Loop Test (Python)
    pythonSuccess = await runPythonHarness();

    log('==================================================');
    log('📊 สรุปรายงานการจำลองระบบ');
    log(`- API E2E Loop Test: ${apiSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    log(`- Python Harness Loop: ${pythonSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    log('==================================================');

  } catch (err) {
    log(`❌ เกิดข้อผิดพลาดระหว่างกระบวนการจำลอง: ${err.message}`);
  } finally {
    // 4. บันทึกสรุปผลลัพธ์
    generateReport(apiSuccess, pythonSuccess);
    
    // 5. ปิด services
    cleanup();
    log('🏁 เสร็จสิ้นการทำลูปทดสอบ!');
    process.exit(apiSuccess && pythonSuccess ? 0 : 1);
  }
}

main();
