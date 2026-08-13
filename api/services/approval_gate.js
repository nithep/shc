'use strict';

const { randomUUID } = require('crypto');

const RISK = Object.freeze({
  HR_01: {
    code: 'HR-01',
    name: 'All-Room Power ON/OFF',
    level: 'critical',
    description: 'สั่งเปิด/ปิดไฟทุกห้องพร้อมกัน',
  },
  HR_02: {
    code: 'HR-02',
    name: 'Emergency Override',
    level: 'critical',
    description: 'สั่งตัดไฟฉุกเฉินทั้งชั้น/ทั้งอาคาร',
  },
  HR_03: {
    code: 'HR-03',
    name: 'Relay Batch Operation',
    level: 'high',
    description: 'สั่ง relay มากกว่า 5 ห้องพร้อมกันใน batch เดียว',
  },
  HR_04: {
    code: 'HR-04',
    name: 'Command Outside Schedule',
    level: 'high',
    description: 'คำสั่ง ON/OFF ถูกยิงนอกเวลาทำการปกติ',
  },
  HR_05: {
    code: 'HR-05',
    name: 'Manual Relay Override',
    level: 'high',
    description: 'สั่ง relay โดยตรงโดยไม่ผ่าน booking/check-in flow',
  },
  HR_06: {
    code: 'HR-06',
    name: 'Firmware/Config Push',
    level: 'critical',
    description: 'ส่ง configuration หรือ firmware ไปยังอุปกรณ์',
  },
  HR_07: {
    code: 'HR-07',
    name: 'Serial Port Mode Change',
    level: 'critical',
    description: 'เปลี่ยนโหมด Dry-run/Live หรือปลดล็อก serial port',
  },
});

const SIDE_EFFECT_COMMANDS = new Set([
  'ROOM_ON',
  'ROOM_OFF',
  'ROOM_SET',
  'BATCH_ROOM_SET',
  'ALL_ROOM_ON',
  'ALL_ROOM_OFF',
  'EMERGENCY_OVERRIDE',
  'CONFIG_PUSH',
  'FIRMWARE_PUSH',
  'SERIAL_PORT_MODE_CHANGE',
]);

const POWER_COMMANDS = new Set([
  'ROOM_ON',
  'ROOM_OFF',
  'ROOM_SET',
  'BATCH_ROOM_SET',
  'ALL_ROOM_ON',
  'ALL_ROOM_OFF',
]);

const APPROVED_FLOW_SOURCES = new Set([
  'checkin_flow',
  'checkout_flow',
  'self_checkin',
  'self_checkout',
  'booking_flow',
  'sync_recovery',
  'system_sync',
  'guest_portal',
]);

function parseClockMinutes(value, fallback) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }

  return hour * 60 + minute;
}

function isInsideSchedule(date, startMinutes, endMinutes) {
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }

  return minutes >= startMinutes || minutes < endMinutes;
}

class ApprovalGate {
  constructor(options = {}) {
    this.approvalTtlMs = options.approvalTtlMs || 60 * 1000;
    this.pendingTtlMs = options.pendingTtlMs || 10 * 60 * 1000;
    this.enforceSchedule = options.enforceSchedule !== false;
    this.scheduleStartMinutes = parseClockMinutes(options.scheduleStart || '06:00', 6 * 60);
    this.scheduleEndMinutes = parseClockMinutes(options.scheduleEnd || '00:00', 0);
    this._pending = new Map();
  }

  isSideEffect(commandType) {
    return SIDE_EFFECT_COMMANDS.has(commandType);
  }

  classify(command, now = new Date()) {
    const commandType = command.commandType || 'UNKNOWN';
    const targetRooms = Array.isArray(command.targetRooms) ? command.targetRooms : [];
    const source = command.source || 'unknown';

    if (!this.isSideEffect(commandType)) {
      return this._safe('คำสั่งอ่านสถานะ ไม่มี side effect');
    }

    if (commandType === 'SERIAL_PORT_MODE_CHANGE') {
      return this._risk(RISK.HR_07);
    }

    if (commandType === 'CONFIG_PUSH' || commandType === 'FIRMWARE_PUSH') {
      return this._risk(RISK.HR_06);
    }

    if (commandType === 'EMERGENCY_OVERRIDE') {
      return this._risk(RISK.HR_02);
    }

    if (
      commandType === 'ALL_ROOM_ON' ||
      commandType === 'ALL_ROOM_OFF' ||
      targetRooms.includes('*')
    ) {
      return this._risk(RISK.HR_01);
    }

    if (targetRooms.length > 5 || commandType === 'BATCH_ROOM_SET') {
      return this._risk(RISK.HR_03);
    }

    if (POWER_COMMANDS.has(commandType) && !APPROVED_FLOW_SOURCES.has(source)) {
      return this._risk(RISK.HR_05);
    }

    if (
      this.enforceSchedule &&
      POWER_COMMANDS.has(commandType) &&
      !isInsideSchedule(now, this.scheduleStartMinutes, this.scheduleEndMinutes)
    ) {
      return this._risk(RISK.HR_04);
    }

    return this._safe('คำสั่งอยู่ใน flow ปกติและไม่เข้า taxonomy เสี่ยงสูง');
  }

  requestApproval(command, classification, now = new Date()) {
    const approvalId = randomUUID();
    const requestedAt = now.toISOString();
    const pendingExpiresAt = new Date(now.getTime() + this.pendingTtlMs).toISOString();

    const record = {
      approvalId,
      status: 'PENDING_APPROVAL',
      command,
      classification,
      requestedAt,
      pendingExpiresAt,
      approvedAt: null,
      approvalExpiresAt: null,
      executedAt: null,
      decidedBy: null,
      decidedAt: null,
      reason: null,
      ipAddress: null,
    };

    this._pending.set(approvalId, record);
    return record;
  }

  listPending(now = new Date()) {
    this.expirePending(now);
    return Array.from(this._pending.values())
      .filter((record) => record.status === 'PENDING_APPROVAL' || record.status === 'APPROVED')
      .map((record) => this.serialize(record));
  }

  get(approvalId) {
    const record = this._pending.get(approvalId);
    return record ? this.serialize(record) : null;
  }

  approve(approvalId, decision, now = new Date()) {
    this.expirePending(now);
    const record = this._pending.get(approvalId);
    if (!record) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }
    if (record.status !== 'PENDING_APPROVAL') {
      throw new Error(`Approval request is not pending: ${record.status}`);
    }
    if (!decision || !decision.reason || !String(decision.reason).trim()) {
      throw new Error('Approval reason is required');
    }

    record.status = 'APPROVED';
    record.decidedBy = decision.decidedBy || 'admin:unknown';
    record.decidedAt = now.toISOString();
    record.reason = String(decision.reason).trim();
    record.ipAddress = decision.ipAddress || null;
    record.approvedAt = now.toISOString();
    record.approvalExpiresAt = new Date(now.getTime() + this.approvalTtlMs).toISOString();

    return record;
  }

  reject(approvalId, decision, now = new Date()) {
    this.expirePending(now);
    const record = this._pending.get(approvalId);
    if (!record) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }
    if (record.status !== 'PENDING_APPROVAL') {
      throw new Error(`Approval request is not pending: ${record.status}`);
    }
    if (!decision || !decision.reason || !String(decision.reason).trim()) {
      throw new Error('Reject reason is required');
    }

    record.status = 'REJECTED';
    record.decidedBy = decision.decidedBy || 'admin:unknown';
    record.decidedAt = now.toISOString();
    record.reason = String(decision.reason).trim();
    record.ipAddress = decision.ipAddress || null;

    this._pending.delete(approvalId);
    return record;
  }

  consumeApproved(approvalId, now = new Date()) {
    const record = this._pending.get(approvalId);
    if (!record) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }
    if (record.status !== 'APPROVED') {
      throw new Error(`Approval request has not been approved: ${record.status}`);
    }

    const expiresAt = new Date(record.approvalExpiresAt);
    if (Number.isNaN(expiresAt.getTime()) || now > expiresAt) {
      record.status = 'EXPIRED';
      this._pending.delete(approvalId);
      throw new Error('Approval expired before command execution');
    }

    return record;
  }

  markExecuted(approvalId, now = new Date()) {
    const record = this._pending.get(approvalId);
    if (!record) {
      return null;
    }

    record.status = 'EXECUTED';
    record.executedAt = now.toISOString();
    this._pending.delete(approvalId);
    return record;
  }

  expirePending(now = new Date()) {
    for (const [approvalId, record] of this._pending.entries()) {
      if (record.status !== 'PENDING_APPROVAL') {
        continue;
      }

      const pendingExpiresAt = new Date(record.pendingExpiresAt);
      if (!Number.isNaN(pendingExpiresAt.getTime()) && now > pendingExpiresAt) {
        record.status = 'EXPIRED';
        this._pending.delete(approvalId);
      }
    }
  }

  serialize(record) {
    return {
      approval_id: record.approvalId,
      status: record.status,
      trace_id: record.command.traceId,
      command: {
        command_type: record.command.commandType,
        target_rooms: record.command.targetRooms,
        requested_by: record.command.requestedBy,
        source: record.command.source,
        dry_run: record.command.dryRun,
        execution_mode: record.command.executionMode,
      },
      classification: record.classification,
      requested_at: record.requestedAt,
      pending_expires_at: record.pendingExpiresAt,
      approved_at: record.approvedAt,
      approval_expires_at: record.approvalExpiresAt,
      executed_at: record.executedAt,
      decided_by: record.decidedBy,
      decided_at: record.decidedAt,
      reason: record.reason,
      ip_address: record.ipAddress,
    };
  }

  _risk(risk) {
    return {
      requiresApproval: true,
      riskCode: risk.code,
      riskName: risk.name,
      riskLevel: risk.level,
      reason: risk.description,
    };
  }

  _safe(reason) {
    return {
      requiresApproval: false,
      riskCode: null,
      riskName: null,
      riskLevel: 'low',
      reason,
    };
  }
}

module.exports = {
  ApprovalGate,
  RISK,
  SIDE_EFFECT_COMMANDS,
  APPROVED_FLOW_SOURCES,
};
