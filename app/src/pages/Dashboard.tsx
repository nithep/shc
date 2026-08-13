import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  ZapOff, 
  Users, 
  BedDouble, 
  LogOut, 
  ShieldAlert, 
  Check, 
  X, 
  FileText, 
  Activity, 
  Clock, 
  Lock,
  Video,
  Code,
  Power
} from 'lucide-react';
import TerminalStatus from '../components/TerminalStatus';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BookingModal from '../components/BookingModal';

interface Room {
  id: number;
  status: 'occupied' | 'vacant';
  power: boolean;
  guest_name?: string;
  checkout_date?: string;
}

interface PendingApproval {
  approval_id: string;
  status: string;
  trace_id: string;
  command: {
    command_type: string;
    target_rooms: string[];
    requested_by: string;
    source: string;
    dry_run: boolean;
  };
  classification: {
    requiresApproval: boolean;
    riskCode: string | null;
    riskName: string | null;
    riskLevel: string;
    reason: string;
  };
  requested_at: string;
  pending_expires_at: string;
}

interface AuditEvent {
  event_id: string;
  trace_id: string;
  timestamp: string;
  event_type: string;
  command_type: string;
  target_rooms: string;
  requested_by: string;
  risk_code: string | null;
  decided_by: string | null;
  reason: string | null;
  result: string | null;
}

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 350, damping: 25 } },
};

const Dashboard = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rooms' | 'approvals' | 'audit' | 'developer'>('rooms');
  const [pbxInfo, setPbxInfo] = useState<{ mode: string; isReady: boolean; details: string } | null>(null);
  
  // Authentication State
  const { role, token, logout } = useAuth();
  
  // Since we use ProtectedRoute, we know we are authenticated if we reach here
  const isAuthenticated = !!token;

  // Modal State for Approval Reason
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [actionReason, setActionReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);

  // Booking State
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedRoomForBooking, setSelectedRoomForBooking] = useState<number | null>(null);



  const handleLogout = () => {
    logout();
  };
  const fetchDiagnostics = async () => {
    try {
      const res = await api.getDiagnostics();
      if (res.data.success && res.data.report?.pbx) {
        setPbxInfo({
          mode: res.data.report.pbx.mode,
          isReady: res.data.report.pbx.isReady,
          details: res.data.report.pbx.details
        });
      }
    } catch (error) {
      console.error("Failed to fetch diagnostics", error);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await api.getRooms();
      if (res.data.success) {
        setRooms(res.data.rooms);
      }
    } catch (error) {
      console.error("Failed to fetch rooms", error);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      const res = await api.getPendingApprovals();
      if (res.data.success) {
        setPendingApprovals(res.data.pending);
      }
    } catch (error) {
      console.error("Failed to fetch pending approvals", error);
    }
  };

  const fetchAuditLogs = async () => {
    if (role !== 'owner') return;
    try {
      const res = await api.getAuditEvents({ limit: 25 });
      if (res.data.success) {
        setAuditLogs(res.data.events);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
    }
  };

  const fetchApiKeys = async () => {
    if (role !== 'owner') return;
    try {
      const res = await api.getApiKeys();
      if (res.data.success) {
        setApiKeys(res.data.keys);
      }
    } catch (error) {
      console.error("Failed to fetch API keys", error);
    }
  };

  const loadAllData = async () => {
    if (!isAuthenticated) return;
    const promises = [fetchRooms(), fetchPendingApprovals(), fetchDiagnostics()];
    if (role === 'owner') {
      promises.push(fetchAuditLogs());
      promises.push(fetchApiKeys());
    }
    await Promise.all(promises);
    setIsLoading(false);
  };

  // Setup EventSource for real-time updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const es = new EventSource('/api/telemetry/stream');
    
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('[SSE]', data);
      
      // Auto-refresh rooms on PBX events
      if (data.type === 'pbx') {
        fetchRooms();
      }
    };

    es.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadAllData();
    const interval = setInterval(() => {
      fetchRooms();
      fetchPendingApprovals();
      fetchDiagnostics();
      if (activeTab === 'audit' && role === 'owner') fetchAuditLogs();
      if (activeTab === 'developer' && role === 'owner') fetchApiKeys();
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, isAuthenticated, role]);

  const showAlert = (type: 'success' | 'error' | 'warning', text: string) => {
    setAlertMessage({ type, text });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  const handleCheckout = async (roomId: number) => {
    try {
      const response = await api.checkOut(String(roomId));
      const data = response.data;
      
      if (response.status === 202 && data.reason === 'APPROVAL_REQUIRED') {
        showAlert('warning', `⚠️ คำสั่งเช็คเอาท์ห้อง ${roomId} ถูกส่งไปยังระบบความปลอดภัย (รออนุมัติเนื่องจากอยู่นอกเวลาทำการ)`);
        loadAllData();
      } else if (response.status === 200) {
        showAlert('success', `✅ เช็คเอาท์ห้อง ${roomId} สำเร็จ`);
        fetchRooms();
        if (role === 'owner') fetchAuditLogs();
      } else {
        showAlert('error', `❌ เกิดข้อผิดพลาด: ${data.error || 'ไม่สามารถทำรายการได้'}`);
      }
    } catch (error: any) {
      console.error("Checkout failed", error);
      showAlert('error', error.message || '❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    }
  };

  const openActionModal = (id: string, action: 'approve' | 'reject') => {
    setSelectedApprovalId(id);
    setModalAction(action);
    setActionReason(action === 'approve' ? 'อนุมัติการสั่งงานระดับแอดมิน' : 'ปฏิเสธเนื่องจากไม่มีผู้เข้าพักหรืออยู่นอกเวลาทำการ');
    setShowReasonModal(true);
  };

  const submitApprovalAction = async () => {
    if (!selectedApprovalId || !actionReason.trim()) return;
    setIsSubmittingAction(true);

    try {
      if (modalAction === 'approve') {
        await api.approveCommand(selectedApprovalId, actionReason, `staff:${role}`);
        await api.executeApproved(selectedApprovalId);
        showAlert('success', '✅ อนุมัติและสั่งการไฟฟ้าเรียบร้อยแล้ว');
      } else {
        await api.rejectCommand(selectedApprovalId, actionReason, `staff:${role}`);
        showAlert('success', '❌ ปฏิเสธคำสั่งเรียบร้อยแล้ว');
      }

      setShowReasonModal(false);
      loadAllData();
    } catch (error: any) {
      showAlert('error', `❌ เกิดข้อผิดพลาด: ${error.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (role !== 'owner') return;
    const name = prompt("ชื่อระบบ PMS ที่ต้องการออก API Key (เช่น Cloudbeds, Fidelio):");
    if (!name) return;
    
    try {
      const response = await api.createApiKey(name);
      showAlert('success', `✅ สร้าง API Key สำหรับ ${name} แล้ว (คัดลอกคีย์: ${response.data.key.apiKey})`);
      fetchApiKeys();
    } catch (error: any) {
      showAlert('error', `❌ ${error.message}`);
    }
  };

  const handleRevokeApiKey = async (id: number) => {
    if (role !== 'owner') return;
    if (!confirm("คุณแน่ใจหรือไม่ที่จะเพิกถอน API Key นี้? PMS จะไม่สามารถสั่งการได้อีกต่อไป")) return;
    
    try {
      await api.revokeApiKey(String(id));
      showAlert('success', '✅ เพิกถอน API Key แล้ว');
      fetchApiKeys();
    } catch (error: any) {
      showAlert('error', `❌ ${error.message}`);
    }
  };

  const handleClearAuditLogs = async () => {
    if (role !== 'owner') return;
    if (!confirm("⚠️ คุณแน่ใจหรือไม่ที่จะลบประวัติการเช็คอินทั้งหมด? การกระทำนี้ไม่สามารถย้อนคืนได้ (PDPA Purge)")) return;

    try {
      await api.clearAuditEvents();
      showAlert('success', '🗑️ ล้างประวัติ Audit Logs ทั้งหมดสำเร็จ');
      fetchAuditLogs();
    } catch (error: any) {
      showAlert('error', `❌ ${error.message}`);
    }
  };

  const stats = {
    total: rooms.length,
    occupied: rooms.filter((r) => r.status === 'occupied').length,
    vacant: rooms.filter((r) => r.status === 'vacant').length,
    powerOn: rooms.filter((r) => r.power).length,
    pending: pendingApprovals.length,
  };

  // No embedded login screen needed since ProtectedRoute handles it

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
        <Activity className="animate-spin text-hotel-accent mb-4" size={40} />
        <p className="font-semibold">กำลังเชื่อมต่อกับระบบควบคุม Hotel ECS...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Alert Toast */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 right-4 z-50 px-6 py-4 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-md max-w-md ${
              alertMessage.type === 'success' 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' 
                : alertMessage.type === 'error'
                ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                : 'bg-amber-950/80 text-amber-300 border-amber-800'
            }`}
          >
            <span className="text-sm font-medium">{alertMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Main Stats */}
      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-hotel-city to-hotel-accent drop-shadow-lg">
              Hotel ECS
            </h1>
            <p className="text-slate-400 mt-1.5 flex items-start gap-2 font-medium text-xs sm:text-sm">
              <span className="relative flex h-2.5 w-2.5 mt-1 flex-shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  pbxInfo?.isReady || pbxInfo?.mode === 'mock' ? 'bg-hotel-accent' : 'bg-rose-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  pbxInfo?.isReady || pbxInfo?.mode === 'mock' ? 'bg-hotel-accent shadow-[0_0_8px_rgba(56,189,248,0.8)]' : 'bg-rose-500'
                }`}></span>
              </span>
              <span className="leading-snug line-clamp-2">
                {pbxInfo ? (
                  pbxInfo.mode === 'tcp' ? (
                    pbxInfo.isReady
                      ? `PBX เชื่อมต่อสำเร็จ (${pbxInfo.details.match(/\d+\.\d+\.\d+\.\d+:\d+/)?.[0] || '192.168.1.91'})`
                      : 'PBX กำลังเชื่อมต่อ... (TCP ขัดข้อง)'
                  ) : 'ระบบจำลอง PBX (Simulator)'
                ) : 'กำลังตรวจสอบการเชื่อมต่อ...'}
              </span>
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <a
              href="https://meet.google.com/new" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-hotel-city/10 hover:bg-hotel-city/20 border border-hotel-city/30 text-hotel-city rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95"
            >
              <Video size={15} />
              <span className="hidden sm:inline">Virtual Kiosk</span>
              <span className="sm:hidden">Kiosk</span>
            </a>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/30 text-rose-400 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">ล็อกเอาท์</span>
            </button>
          </div>
        </div>

        {/* Dynamic Navigation Tabs */}
        <div className="flex bg-hotel-dark/40 backdrop-blur-md p-1 rounded-2xl border border-white/10 w-full overflow-x-auto shadow-inner scrollbar-none gap-0.5">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`flex-1 lg:flex-none px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${
              activeTab === 'rooms' 
                ? 'bg-hotel-card text-hotel-accent shadow-[0_0_15px_rgba(56,189,248,0.2)] border border-hotel-accent/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BedDouble size={18} />
            สถานะห้องพัก ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex-1 lg:flex-none px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 relative whitespace-nowrap ${
              activeTab === 'approvals' 
                ? 'bg-hotel-card text-hotel-accent shadow-[0_0_15px_rgba(56,189,248,0.2)] border border-hotel-accent/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldAlert size={18} />
            ค้างการอนุมัติ
            {stats.pending > 0 && (
              <span className="absolute -top-2 -right-2 bg-hotel-danger text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-[0_0_10px_rgba(225,29,72,0.6)] animate-pulse">
                {stats.pending}
              </span>
            )}
          </button>
          {role === 'owner' && (
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex-1 lg:flex-none px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'audit' 
                  ? 'bg-hotel-card text-hotel-accent shadow-[0_0_15px_rgba(56,189,248,0.2)] border border-hotel-accent/30' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileText size={18} />
              ประวัติ (Audit Log)
            </button>
          )}
          {role === 'owner' && (
            <button
              onClick={() => setActiveTab('developer')}
              className={`flex-1 lg:flex-none px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'developer' 
                  ? 'bg-hotel-card text-hotel-accent shadow-[0_0_15px_rgba(56,189,248,0.2)] border border-hotel-accent/30' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Code size={18} />
              Open API
            </button>
          )}
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[{
          icon: <BedDouble size={20} />, label: 'ทั้งหมด', value: `${stats.total}`, sub: 'ห้อง',
          color: 'text-hotel-accent', bg: 'bg-hotel-accent/10', border: 'hover:border-hotel-accent/30'
        }, {
          icon: <Users size={20} />, label: 'เข้าพัก', value: `${stats.occupied}`, sub: 'ห้อง',
          color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/30'
        }, {
          icon: <Zap size={20} />, label: 'จ่ายไฟ', value: `${stats.powerOn}`, sub: 'ห้อง',
          color: 'text-hotel-accent', bg: 'bg-hotel-accent/15 animate-pulse-slow', border: 'hover:border-hotel-accent/30'
        }, {
          icon: <Lock size={20} />, label: 'รออนุมัติ', value: `${stats.pending}`, sub: 'รายการ',
          color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'hover:border-amber-500/30'
        }].map((s, i) => (
          <div key={i} className={`glass-panel rounded-2xl p-3 sm:p-5 flex items-center gap-3 relative overflow-hidden transition-colors ${s.border}`}>
            <div className={`p-2 sm:p-3 ${s.bg} ${s.color} rounded-xl flex-shrink-0`}>{s.icon}</div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider truncate">{s.label}</p>
              <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value} <span className="text-xs font-normal text-slate-500">{s.sub}</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Tab Content */}
      <div className="min-h-[40vh]">
        <AnimatePresence mode="wait">
          {/* TAB 1: ROOM STATUS */}
          {activeTab === 'rooms' && (
            <motion.div
              key="rooms"
              variants={containerVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4"
            >
              {rooms.map((room) => {
                // Color coding based on status
                const isOccupied = room.status === 'occupied';
                const hasPower = room.power;
                
                let cardBgClass = '';
                let borderColorClass = '';
                let statusColor = '';
                
                if (isOccupied && hasPower) {
                  // Occupied with power ON - Green/Emerald
                  cardBgClass = 'bg-emerald-500/10 hover:bg-emerald-500/15';
                  borderColorClass = 'border-emerald-500/30 hover:border-emerald-500/50';
                  statusColor = 'text-emerald-400';
                } else if (isOccupied && !hasPower) {
                  // Occupied but power OFF - Yellow/Amber warning
                  cardBgClass = 'bg-amber-500/10 hover:bg-amber-500/15';
                  borderColorClass = 'border-amber-500/30 hover:border-amber-500/50';
                  statusColor = 'text-amber-400';
                } else {
                  // Vacant - Red/Rose
                  cardBgClass = 'bg-rose-500/10 hover:bg-rose-500/15';
                  borderColorClass = 'border-rose-500/30 hover:border-rose-500/50';
                  statusColor = 'text-rose-400';
                }
                
                return (
                  <motion.div
                    key={room.id}
                    variants={itemVariants}
                    layout
                    className={`glass-panel rounded-xl sm:rounded-2xl p-3 sm:p-5 ${borderColorClass} ${cardBgClass} hover:shadow-[0_0_30px_rgba(56,189,248,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[140px] sm:min-h-[180px] group`}
                  >
                    {/* Status indicator dot */}
                    <div className={`absolute top-2 right-2 sm:top-3 sm:right-3 w-2 h-2 sm:w-3 sm:h-3 rounded-full ${isOccupied ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'} shadow-lg`} />
                    
                    <div className="flex justify-between items-start mb-2 sm:mb-4">
                      <div>
                        <h3 className="text-lg sm:text-2xl font-bold text-slate-100 tracking-tight">
                          {room.id}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${isOccupied ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide ${statusColor}`}>
                            {isOccupied ? 'เข้าพัก' : 'ว่าง'}
                          </span>
                        </div>
                      </div>

                      <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl border ${hasPower ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-950/50 text-slate-600 border-slate-900'}`}>
                        {hasPower ? <Zap size={16} className="sm:w-5 sm:h-5 fill-current" /> : <ZapOff size={16} className="sm:w-5 sm:h-5" />}
                      </div>
                    </div>

                    {/* Guest info (if occupied and staff/owner) */}
                    {(role === 'front_desk' || role === 'owner') && room.guest_name && (
                      <div className="mb-2 sm:mb-3">
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                          {room.guest_name}
                        </p>
                        {room.checkout_date && (
                          <p className="text-[9px] sm:text-[10px] text-slate-600">
                            Checkout: {new Date(room.checkout_date).toLocaleDateString('th-TH')}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 mt-auto pt-2 sm:pt-4 border-t border-slate-900/60">
                      <div>
                        <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-wider">ไฟฟ้า</span>
                        <p className={`text-xs sm:text-sm font-semibold mt-0.5 ${hasPower ? 'text-amber-400' : 'text-slate-500'}`}>
                          {hasPower ? 'ON' : 'OFF'}
                        </p>
                      </div>

                      <div className="flex justify-end items-end gap-1">
                        {/* Admin controls for owner/front_desk */}
                        {(role === 'owner' || role === 'front_desk') && (
                          <>
                            {isOccupied && (
                              <button
                                onClick={() => handleCheckout(room.id)}
                                className="flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors border border-rose-500/20 font-medium"
                                title="เช็คเอาท์"
                              >
                                <LogOut size={12} className="sm:hidden" />
                                <LogOut size={14} className="hidden sm:block" />
                              </button>
                            )}
                            
                            {/* Power toggle for owner */}
                            {role === 'owner' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await api.forceControl(String(room.id), hasPower ? 'OFF' : 'ON', 'dashboard_admin');
                                    showAlert('success', `✅ สั่ง${hasPower ? 'ปิด' : 'เปิด'}ไฟห้อง ${room.id} สำเร็จ`);
                                    fetchRooms();
                                  } catch (error: any) {
                                    showAlert('error', error.message);
                                  }
                                }}
                                className={`flex items-center justify-center ${hasPower ? 'bg-slate-700/30 hover:bg-slate-700/50 text-slate-400' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'} text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors border border-white/10 font-medium`}
                                title={hasPower ? 'ปิดไฟ' : 'เปิดไฟ'}
                              >
                                <Power size={12} className="sm:hidden" />
                                <Power size={14} className="hidden sm:block" />
                              </button>
                            )}
                          </>
                        )}
                        
                        {/* Create Booking for Vacant Rooms (Staff/Admin) */}
                        {!isOccupied && (role === 'owner' || role === 'front_desk') && (
                          <button
                            onClick={() => {
                              setSelectedRoomForBooking(room.id);
                              setIsBookingModalOpen(true);
                            }}
                            className="flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors border border-indigo-500/20 font-medium whitespace-nowrap"
                            title="สร้างการจอง"
                          >
                            จองห้อง
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {/* TAB 2: PENDING APPROVALS */}
          {activeTab === 'approvals' && (
            <motion.div
              key="approvals"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-4"
            >
              {pendingApprovals.length === 0 ? (
                <div className="bg-hotel-card/50 backdrop-blur-md rounded-2xl border border-white/5 p-12 text-center text-slate-500 max-w-xl mx-auto flex flex-col items-center shadow-inner">
                  <ShieldAlert className="text-slate-600 mb-3" size={48} />
                  <h3 className="text-lg font-bold text-slate-300">ไม่มีรายการค้างอนุมัติ</h3>
                  <p className="text-sm mt-1">คำสั่งเสี่ยงสูงทั้งหมดถูกดำเนินการหรือถูกปฏิเสธแล้ว</p>
                </div>
              ) : (
                pendingApprovals.map((req) => {
                  const timeLeft = Math.max(0, Math.round((new Date(req.pending_expires_at).getTime() - Date.now()) / 1000));
                  return (
                    <div key={req.approval_id} className="bg-hotel-card border border-slate-900 rounded-2xl p-6 relative overflow-hidden flex flex-col lg:flex-row justify-between gap-6 hover:shadow-xl transition-all">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
                      
                      <div className="space-y-3 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-amber-950 text-amber-400 border border-amber-800 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                            {req.classification.riskCode} - {req.classification.riskName}
                          </span>
                          <span className="bg-rose-950 text-rose-400 border border-rose-900 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                            {req.classification.riskLevel}
                          </span>
                          <span className="text-slate-500 text-xs flex items-center gap-1 ml-auto lg:ml-0">
                            <Clock size={12} /> ขอเมื่อ: {new Date(req.requested_at).toLocaleTimeString('th-TH')}
                          </span>
                        </div>

                        <h3 className="text-xl font-bold text-slate-100">
                          คำสั่ง {req.command.command_type} ➡️ ห้อง {req.command.target_rooms.join(', ')}
                        </h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          ⚠️ *เหตุผลความเสี่ยง:* {req.classification.reason}
                        </p>

                        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-xs text-slate-500">
                          <div>ร้องขอโดย: <span className="text-slate-300 font-medium">{req.command.requested_by}</span></div>
                          <div>ช่องทาง: <span className="text-slate-300 font-medium">{req.command.source}</span></div>
                          <div>Trace ID: <span className="text-slate-300 font-mono">{req.trace_id}</span></div>
                        </div>
                      </div>

                      <div className="flex flex-row lg:flex-col justify-end items-center lg:items-end gap-3 lg:border-l lg:border-slate-900 lg:pl-6 min-w-[200px]">
                        <div className="text-xs text-amber-500 font-bold mb-0 lg:mb-2 flex items-center gap-1.5">
                          <Clock size={14} className="animate-pulse" />
                          เหลือเวลา: {timeLeft} วินาที
                        </div>

                        <div className="flex gap-2 w-full">
                          <button
                            onClick={() => openActionModal(req.approval_id, 'approve')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20"
                          >
                            <Check size={14} /> อนุมัติ (Approve)
                          </button>
                          <button
                            onClick={() => openActionModal(req.approval_id, 'reject')}
                            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/20"
                          >
                            <X size={14} /> ปฏิเสธ (Reject)
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* TAB 3: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-hotel-card border border-slate-900 rounded-2xl p-6 shadow-lg">
                <div>
                  <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <FileText className="text-hotel-accent" /> บันทึกประวัติระบบ (Audit Logs)
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">ประวัติการสั่งงาน ตรวจสอบ และการอนุมัติคำสั่งควบคุมไฟฟ้าจริงย้อนหลังทั้งหมด</p>
                </div>
                <button
                  onClick={handleClearAuditLogs}
                  className="bg-rose-950/40 hover:bg-rose-950/60 border border-rose-900/40 text-rose-400 px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-rose-950/20 whitespace-nowrap hover:bg-rose-950/60 hover:border-rose-800"
                >
                  🗑️ ล้างประวัติทั้งหมด
                </button>
              </div>

              <motion.div
                key="audit"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-hotel-card border border-slate-900 rounded-2xl overflow-hidden"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900 bg-slate-950 text-slate-400 text-xs font-bold uppercase tracking-wider">
                        <th className="p-4">เวลา</th>
                        <th className="p-4">เหตุการณ์</th>
                        <th className="p-4">คำสั่ง</th>
                        <th className="p-4">ห้อง</th>
                        <th className="p-4">แอดมิน / ผู้อนุมัติ</th>
                        <th className="p-4">เหตุผล</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
                      {auditLogs.map((log) => (
                        <tr key={log.event_id} className="hover:bg-slate-950/30 transition-colors">
                          <td className="p-4 whitespace-nowrap text-slate-500 text-xs">
                            {new Date(log.timestamp).toLocaleString('th-TH')}
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                              log.event_type === 'APPROVED' 
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : log.event_type === 'REJECTED'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : log.event_type === 'AUTO_PASSED'
                                ? 'bg-slate-900 text-slate-400 border border-slate-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {log.event_type}
                            </span>
                          </td>
                          <td className="p-4 font-semibold text-slate-200">{log.command_type}</td>
                          <td className="p-4 text-hotel-accent font-mono">{log.target_rooms || '-'}</td>
                          <td className="p-4 text-xs">{log.decided_by || log.requested_by || 'system'}</td>
                          <td className="p-4 text-slate-400 text-xs max-w-xs truncate">{log.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </div>
          )}

          {/* TAB 4: DEVELOPER / OPEN API */}
          {activeTab === 'developer' && (
            <motion.div
              key="developer"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center bg-hotel-card border border-slate-900 rounded-2xl p-6 shadow-lg">
                <div>
                  <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <Code className="text-hotel-accent" /> Developer Portal (Open API)
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">จัดการ API Keys สำหรับเชื่อมต่อระบบ Hotel ECS กับระบบ Property Management System (PMS) ภายนอก</p>
                </div>
                <button
                  onClick={handleCreateApiKey}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-950/20 whitespace-nowrap"
                >
                  + สร้าง API Key ใหม่
                </button>
              </div>

              <div className="bg-hotel-card border border-slate-900 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-950 text-slate-400 text-xs font-bold uppercase tracking-wider">
                      <th className="p-4">ระบบ PMS (ชื่อ)</th>
                      <th className="p-4">API Key (Prefix)</th>
                      <th className="p-4">สถานะ</th>
                      <th className="p-4">สร้างเมื่อ</th>
                      <th className="p-4">ใช้งานล่าสุด</th>
                      <th className="p-4 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-sm text-slate-300">
                    {apiKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          ยังไม่มี API Key ในระบบ
                        </td>
                      </tr>
                    ) : (
                      apiKeys.map((key) => (
                        <tr key={key.id} className="hover:bg-slate-950/30 transition-colors">
                          <td className="p-4 font-semibold text-slate-200">{key.name}</td>
                          <td className="p-4 text-hotel-accent font-mono">{key.key_prefix}</td>
                          <td className="p-4">
                            {key.is_active ? (
                              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase">Active</span>
                            ) : (
                              <span className="bg-rose-950 text-rose-400 border border-rose-800 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase">Revoked</span>
                            )}
                          </td>
                          <td className="p-4 text-xs text-slate-400">{new Date(key.created_at).toLocaleString('th-TH')}</td>
                          <td className="p-4 text-xs text-slate-400">{key.last_used_at ? new Date(key.last_used_at).toLocaleString('th-TH') : '-'}</td>
                          <td className="p-4 text-right">
                            {key.is_active && (
                              <button
                                onClick={() => handleRevokeApiKey(key.id)}
                                className="text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-rose-900/30"
                              >
                                เพิกถอน (Revoke)
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Modal (Approve/Reject Reason) */}
      <AnimatePresence>
        {showReasonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReasonModal(false)}
              className="absolute inset-0 bg-black"
            />

            {/* Modal Body */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-hotel-card border border-slate-800 rounded-2xl w-full max-w-md p-6 relative z-10 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-3">
                {modalAction === 'approve' ? (
                  <>
                    <Check className="text-emerald-500" />
                    ยืนยันการอนุมัติคำสั่ง
                  </>
                ) : (
                  <>
                    <X className="text-rose-500" />
                    ยืนยันการปฏิเสธคำสั่ง
                  </>
                )}
              </h3>
              
              <p className="text-slate-400 text-sm mb-4">
                กรุณาระบุเหตุผลในการกดยืนยัน (เหตุผลนี้จะถูกเก็บถาวรในประวัติ Audit Log เพื่อความโปร่งใส)
              </p>

              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="ระบุเหตุผลที่นี่..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-900 focus:border-hotel-accent focus:ring-1 focus:ring-hotel-accent rounded-xl p-3 text-slate-200 text-sm outline-none resize-none mb-5"
              />

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowReasonModal(false)}
                  className="bg-slate-950 text-slate-400 border border-slate-900 hover:bg-slate-900 hover:text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={submitApprovalAction}
                  disabled={isSubmittingAction}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 ${
                    modalAction === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/20'
                      : 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/20'
                  }`}
                >
                  {isSubmittingAction ? (
                    'กำลังบันทึก...'
                  ) : (
                    <>
                      {modalAction === 'approve' ? <Check size={14} /> : <X size={14} />}
                      บันทึกคำอนุมัติ
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Booking Modal Overlay */}
      {selectedRoomForBooking && (
        <BookingModal 
          isOpen={isBookingModalOpen}
          roomId={selectedRoomForBooking}
          onClose={() => {
            setIsBookingModalOpen(false);
            setSelectedRoomForBooking(null);
          }}
          onSuccess={() => {
            fetchRooms();
          }}
        />
      )}

      {/* System Console */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-slate-300 mb-4 flex items-center gap-2">
          <Activity size={18} className="text-hotel-accent" />
          ระบบควบคุมเทอร์มินัล (System Console)
        </h2>
        <TerminalStatus />
      </div>
    </div>
  );
};

export default Dashboard;
