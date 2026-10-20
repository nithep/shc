'use strict';
/**
 * @file shc_acceptance_pi.js — SHC ก้อน C Acceptance (§8) on Pi4
 *
 * รันบน Pi (หลัง 06:00) — ใช้โค้ดที่ deploy จริง (/home/ecs-agent/shc/api)
 * ใช้ runPresenceIdleRound + PolicyVerifier + PresenceSubscriber กับ config จริง
 * (DB ถูก inject เป็น fake ในตัวตรวจ idle เพื่อคุมเวลา; ไม่แตะ hardware)
 *
 * 6 เคส §8:
 *   [1] door idle 30 นาที ประตูปิด (กลางวัน) → ECO (eco_on allow)
 *   [2] suite door idle 29 นาที → ไม่ดับ
 *   [3] 23:00 door idle 2 ชม. → ไม่ดับ (night guard)
 *   [4] override ล็อก → eco_on deny ; ปลด override + eco_off → คืนไฟ (allow)
 *   [5] fail-safe restart (ตรวจแยกด้วย systemctl — ดูใน runner)
 *   [6] MQTT เงียบ/ไม่มี broker → presence subscriber disabled (fail-closed) ไม่ crash
 */

const path = require('path');
const API = process.env.SHC_API_DIR || '/home/ecs-agent/shc/api';

const { runPresenceIdleRound } = require(path.join(API, 'services/cron_scheduler'));
const { PolicyVerifier } = require(path.join(API, 'services/policy_verifier'));
const { PresenceSubscriber } = require(path.join(API, 'services/presence_subscriber'));
const { config } = require(path.join(API, 'services/shc_policy_config'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ' -- ' + detail : ''}`); }
}

// เวลาสมมติ 20 ต.ค. 2026 (Asia/Bangkok = UTC+7)
function at(hour, min = 0) {
    const d = new Date('2026-10-20T00:00:00+07:00');
    d.setHours(hour, min, 0, 0);
    return d.getTime();
}

// fake db สำหรับ idle round (คุมเวลา + ไม่แตะ DB จริง)
function fakeDb(rooms) {
    return {
        getAllRooms: (cb) => cb(null, rooms),
        db: { run: (sql, params, cb) => { if (cb) cb(null); } },
    };
}

(async () => {
    console.log('=== SHC Acceptance Section 8 (Pi4) ===');
    console.log(`dry-run=${config.dryRun}  idleNormal=${config.idleThresholdMinNormal}  idleSuite=${config.idleThresholdMinSuite}  X=${config.doorSensorTimeoutMin}`);
    console.log('');

    const noon = at(14);

    // [1] door idle 30 นาที ประตูปิด กลางวัน → eco_on allow
    {
        const rooms = [{ id: 201, status: 'occupied', power: true, door_closed: 1, warned: 0,
            last_door_open_at: new Date(noon - 30 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        check('[1] door idle 30m + door closed (day) -> ECO', s.ecoOn === 1, `ecoOn=${s.ecoOn} denied=${s.denied}`);
    }

    // [2] suite door idle 29 นาที → ไม่ดับ
    {
        const prevSuite = config.suiteRoomIds;
        config.suiteRoomIds = ['202'];
        const rooms = [{ id: 202, status: 'occupied', power: true, door_closed: 1, warned: 0,
            last_door_open_at: new Date(noon - 29 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => noon });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => noon });
        check('[2] suite door idle 29m -> no ECO', s.ecoOn === 0, `ecoOn=${s.ecoOn}`);
        config.suiteRoomIds = prevSuite;
    }

    // [3] 23:00 door idle 2 ชม. → ไม่ดับ (night guard)
    {
        const night = at(23);
        const rooms = [{ id: 203, status: 'occupied', power: true, door_closed: 1, warned: 0,
            last_door_open_at: new Date(night - 120 * 60000).toISOString() }];
        const pv = new PolicyVerifier({ now: () => night });
        const s = await runPresenceIdleRound(fakeDb(rooms), { policyVerifier: pv, now: () => night });
        check('[3] 23:00 idle 2h -> no ECO (night guard)', s.ecoOn === 0 && s.denied >= 1, `ecoOn=${s.ecoOn} denied=${s.denied}`);
    }

    // [4] override locked → eco_on deny ; unlock + eco_off → allow (คืนไฟ)
    {
        const pv = new PolicyVerifier({ now: () => noon });
        const lockedOn = await pv.verify({ room: '204', command: 'eco_on',
            context: { status: 'occupied', power: true, override_locked: 1, now: noon } });
        check('[4a] override locked -> eco_on deny', lockedOn.decision === 'deny', `decision=${lockedOn.decision}`);

        const off = await pv.verify({ room: '204', command: 'eco_off',
            context: { status: 'occupied', power: false, override_locked: 0, now: noon } });
        check('[4b] override cleared + eco_off -> restore power (allow)', off.decision === 'allow', `decision=${off.decision}`);
    }

    // [6] MQTT เงียบ/ไม่มี broker → disabled (fail-closed) — ไม่ crash
    {
        const savedUrl = process.env.SHC_PRESENCE_MQTT_URL;
        const savedBroker = process.env.MQTT_BROKER_URL;
        delete process.env.SHC_PRESENCE_MQTT_URL;
        delete process.env.MQTT_BROKER_URL;
        const ps = new PresenceSubscriber({});
        let crashed = false;
        try { await ps.connect(); } catch (e) { crashed = true; }
        check('[6] no broker -> subscriber disabled (fail-closed, no crash)',
            ps.disabled === true && ps.client === null && !crashed, `disabled=${ps.disabled} client=${!!ps.client} crashed=${crashed}`);
        if (savedUrl !== undefined) process.env.SHC_PRESENCE_MQTT_URL = savedUrl;
        if (savedBroker !== undefined) process.env.MQTT_BROKER_URL = savedBroker;
    }

    console.log('');
    console.log(`${fail === 0 ? 'PASS' : 'FAIL'} Acceptance: pass=${pass} fail=${fail}`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
    console.error('Acceptance runner crashed:', e && e.stack || e);
    process.exit(2);
});
