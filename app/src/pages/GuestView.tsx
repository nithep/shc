import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import liff from '@line/liff';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound, LogOut, Loader2, AlertCircle, Mail, Video,
  CheckCircle2, Wifi, Phone, Clock, BedDouble, Zap, ZapOff,
  Shield, BadgeCheck, QrCode, User
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  displayName: string;
  pictureUrl?: string;
  userId: string;
}

type GuestStatus = 'loading' | 'no-room' | 'liff-error' | 'pre-checkin' | 'checked-in';

// ─── Avatar Component ─────────────────────────────────────────────────────────
const Avatar = ({ profile }: { profile: Profile | null }) => (
  <div className="relative flex-shrink-0">
    {profile?.pictureUrl ? (
      <>
        <div className="absolute inset-0 rounded-full bg-hotel-accent blur-sm opacity-40 animate-pulse-slow" />
        <img src={profile.pictureUrl} alt="Profile"
          className="relative w-14 h-14 rounded-full border-2 border-hotel-accent/50 object-cover shadow-xl"
        />
      </>
    ) : (
      <div className="w-14 h-14 rounded-full bg-hotel-card flex items-center justify-center border border-hotel-accent/30 shadow-inner">
        <User className="w-6 h-6 text-hotel-accent" />
      </div>
    )}
    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-hotel-dark shadow-lg" />
  </div>
);

// ─── Power Toggle ─────────────────────────────────────────────────────────────
const PowerToggle = ({
  roomPower, onToggle, loading
}: { roomPower: boolean; onToggle: () => void; loading: boolean }) => (
  <div className="flex flex-col items-center gap-5 p-6 bg-slate-950/50 rounded-3xl border border-white/5">
    <p className="text-xs text-slate-500 uppercase tracking-[0.2em] font-semibold">ระบบไฟฟ้าในห้องพัก</p>

    {/* Big toggle */}
    <button
      onClick={onToggle} disabled={loading}
      className={`relative w-32 h-16 rounded-full p-2 transition-all duration-400 focus:outline-none focus:ring-4 ${
        roomPower
          ? 'bg-emerald-500/80 shadow-[0_0_40px_rgba(16,185,129,0.4)] focus:ring-emerald-500/20 border border-emerald-400/30'
          : 'bg-slate-800 border border-slate-700 focus:ring-slate-600/20'
      }`}
    >
      <motion.div
        layout
        animate={{ x: roomPower ? 60 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-2xl text-slate-900"
      >
        {loading
          ? <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          : roomPower
            ? <Zap className="w-5 h-5 text-emerald-600" fill="currentColor" />
            : <ZapOff className="w-5 h-5 text-slate-400" />
        }
      </motion.div>
    </button>

    <motion.p
      animate={{ color: roomPower ? '#34d399' : '#64748b' }}
      className="text-sm font-bold text-center leading-relaxed"
    >
      {roomPower
        ? '🟢 จ่ายไฟเข้าระบบแล้ว\nเสียบคีย์การ์ดเพื่อเปิดไฟ'
        : '🔴 ตัดไฟในห้องพักแล้ว'}
    </motion.p>
  </div>
);

// ─── Main GuestView ───────────────────────────────────────────────────────────
const GuestView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawRoom = searchParams.get('room');
  
  // Extract clean room number if it is formatted as a full URL
  const getCleanRoom = (roomVal: string | null): string => {
    if (!roomVal) return '';
    const trimmed = roomVal.trim();
    if (trimmed.startsWith('http') || trimmed.includes('?')) {
      try {
        const url = new URL(trimmed);
        return url.searchParams.get('room') || trimmed;
      } catch {
        const match = trimmed.match(/[?&]room=(\d+)/);
        return match ? match[1] : trimmed;
      }
    }
    return trimmed;
  };
  
  const roomNumber = getCleanRoom(rawRoom);

  const [status, setStatus] = useState<GuestStatus>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [roomPower, setRoomPower] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Init LIFF ──────────────────────────────────────────────
  useEffect(() => {
    if (!roomNumber) { setStatus('no-room'); return; }

    const initLiff = async () => {
      try {
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) throw new Error('LIFF ID is not configured.');
        await liff.init({ liffId });
        if (liff.isLoggedIn()) {
          const p = await liff.getProfile();
          setProfile({ displayName: p.displayName, pictureUrl: p.pictureUrl, userId: p.userId });
          // Check existing session
          const token = localStorage.getItem(`hotel_hotel_guest_token_${roomNumber}`);
          setStatus(token ? 'checked-in' : 'pre-checkin');
          if (token) { fetchRoomStatus(); startCountdown(); }
        } else {
          liff.login({ redirectUri: window.location.href });
        }
      } catch (e: any) {
        console.error('LIFF error:', e);
        setStatus('liff-error');
      }
    };
    initLiff();
  }, [roomNumber]);

  const fetchRoomStatus = useCallback(async () => {
    if (!roomNumber) return;
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success) {
        const room = data.rooms.find((r: any) => String(r.id) === String(roomNumber));
        if (room) setRoomPower(room.power);
      }
    } catch (e) { console.error('Failed to fetch room status', e); }
  }, [roomNumber]);

  const startCountdown = useCallback(() => {
    const tick = () => {
      const checkoutStr = localStorage.getItem(`hotel_hotel_guest_checkout_${roomNumber}`);
      if (!checkoutStr) return;
      const diff = new Date(checkoutStr).getTime() - Date.now();
      if (diff <= 0) {
        localStorage.removeItem(`hotel_hotel_guest_token_${roomNumber}`);
        localStorage.removeItem(`hotel_hotel_guest_checkout_${roomNumber}`);
        setStatus('pre-checkin');
        showError('สิทธิ์ควบคุมห้องพักหมดอายุแล้ว');
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        setTimeLeftStr(`${h} ชม. ${m} นาที`);
      }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [roomNumber]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const handleCheckin = async () => {
    if (!roomNumber || !profile) return;
    setActionLoading(true); setError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber, guestName: profile.displayName,
          guestEmail: guestEmail.trim() || undefined,
          pdpaConsent: { privacyPolicyAccepted: true, acceptedAt: new Date().toISOString() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Check-in failed');
      if (data.token) {
        localStorage.setItem(`hotel_hotel_guest_token_${roomNumber}`, data.token);
        const checkoutDate = data.checkoutDate || (() => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(12,0,0,0); return t.toISOString(); })();
        localStorage.setItem(`hotel_hotel_guest_checkout_${roomNumber}`, checkoutDate);
        setRoomPower(true);
        startCountdown();
      }
      setStatus('checked-in');
    } catch (e: any) {
      showError(e.message || 'เกิดข้อผิดพลาดในการเช็คอิน');
    } finally { setActionLoading(false); }
  };

  const handleCheckout = async () => {
    if (!roomNumber) return;
    setActionLoading(true); setError(null);
    try {
      const token = localStorage.getItem(`hotel_hotel_guest_token_${roomNumber}`);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roomNumber }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || d.error || 'Checkout failed'); }
      localStorage.removeItem(`hotel_hotel_guest_token_${roomNumber}`);
      localStorage.removeItem(`hotel_hotel_guest_checkout_${roomNumber}`);
      setStatus('pre-checkin');
      setRoomPower(false);
    } catch (e: any) {
      showError(e.message || 'เกิดข้อผิดพลาดในการเช็คเอาท์');
    } finally { setActionLoading(false); }
  };

  const handleTogglePower = async () => {
    if (!roomNumber) return;
    setActionLoading(true); setError(null);
    const token = localStorage.getItem(`hotel_hotel_guest_token_${roomNumber}`);
    try {
      const res = await fetch('/api/rooms/guest-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: roomPower ? 'OFF' : 'ON' }),
      });
      if (!res.ok) throw new Error('สลับไฟห้องพักไม่สำเร็จ');
      setRoomPower(p => !p);
    } catch (e: any) {
      showError(e.message);
    } finally { setActionLoading(false); }
  };

  // ──────────────────── RENDER STATES ─────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-hotel-dark flex flex-col items-center justify-center gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
          <Loader2 className="w-10 h-10 text-hotel-accent" />
        </motion.div>
        <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
          className="text-hotel-city text-xs uppercase tracking-[0.3em]"
        >Connecting...</motion.p>
      </div>
    );
  }

  if (status === 'no-room') {
    return (
      <div className="min-h-screen bg-hotel-dark flex flex-col items-center justify-center p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-w-xs w-full bg-slate-900/80 backdrop-blur-xl rounded-3xl p-8 text-center border border-rose-500/20"
        >
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-rose-500/20">
            <AlertCircle className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">ไม่พบข้อมูลห้อง</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">กรุณาสแกน QR Code ที่ประตูห้องพักของคุณอีกครั้ง</p>
          <Link to="/checkin"
            className="flex items-center justify-center gap-2 w-full py-3 bg-hotel-accent hover:bg-hotel-glow text-hotel-dark font-bold rounded-2xl transition-all text-sm"
          >
            <QrCode size={16} />ไปที่หน้าสแกน QR
          </Link>
        </motion.div>
      </div>
    );
  }

  if (status === 'liff-error') {
    return (
      <div className="min-h-screen bg-hotel-dark flex flex-col items-center justify-center p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="max-w-xs w-full bg-slate-900/80 rounded-3xl p-8 text-center border border-amber-500/20"
        >
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-slate-400 text-sm mb-5">กรุณาเปิดหน้านี้ผ่าน LINE แอป เพื่อยืนยันตัวตน</p>
          <button onClick={() => window.location.reload()}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-2xl transition-all text-sm"
          >ลองใหม่อีกครั้ง</button>
        </motion.div>
      </div>
    );
  }

  // ─── Main Guest View ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-hotel-dark text-white flex flex-col items-center pb-10 relative overflow-hidden">
      {/* Ambient glow */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.35, 0.2] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[100vw] h-[50vh] bg-hotel-accent/15 rounded-full blur-[100px] pointer-events-none"
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm px-4 pt-12 relative z-10 flex flex-col gap-4"
      >

        {/* ── Profile Header ──────────────────────── */}
        <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl p-5 border border-white/8 flex items-center gap-4">
          <Avatar profile={profile} />
          <div className="min-w-0">
            <p className="text-[10px] text-hotel-city uppercase tracking-widest mb-0.5 font-semibold">ผู้เข้าพัก</p>
            <p className="text-lg font-bold text-white truncate">{profile?.displayName || 'Guest'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <BedDouble size={12} className="text-slate-500" />
              <p className="text-slate-400 text-xs">ห้อง <span className="text-white font-bold text-base">{roomNumber}</span></p>
            </div>
          </div>
        </div>

        {/* ── Error Toast ─────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-2xl flex gap-3 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── PRE-CHECKIN VIEW ────────────────────── */}
        <AnimatePresence mode="wait">
          {status === 'pre-checkin' && (
            <motion.div key="pre" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* Email input */}
              <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl p-5 border border-white/8 space-y-4">
                <h2 className="font-bold text-white">เริ่มต้นการเข้าพัก</h2>

                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-hotel-accent transition-colors" />
                  <input
                    type="email" placeholder="อีเมล (ไม่บังคับ — รับใบเสร็จ)"
                    value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                    className="w-full bg-slate-950/50 border border-white/8 rounded-2xl py-3.5 pl-11 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-hotel-accent/50 focus:ring-1 focus:ring-hotel-accent/50 transition-all text-sm"
                  />
                </div>

                {/* PDPA */}
                <label className="flex items-start gap-3 cursor-pointer group/pdpa bg-slate-950/40 rounded-2xl p-4 border border-white/5 hover:border-hotel-accent/20 transition-colors">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input type="checkbox" checked={pdpaConsent} onChange={e => setPdpaConsent(e.target.checked)}
                      className="peer appearance-none w-5 h-5 border-2 border-slate-600 rounded-md checked:bg-hotel-accent checked:border-hotel-accent focus:outline-none focus:ring-2 focus:ring-hotel-accent/30 transition-all cursor-pointer"
                    />
                    <CheckCircle2 className="absolute inset-0 w-5 h-5 text-hotel-dark opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity scale-90" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium mb-1">ยินยอม PDPA</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      ข้าพเจ้ายินยอมให้รวบรวมข้อมูลส่วนบุคคลเพื่อการเข้าพัก
                      ข้อมูลจะถูกลบอัตโนมัติหลังเช็คเอาท์
                    </p>
                    <div className="flex gap-3 mt-2">
                      {[<Shield size={10} />, <BadgeCheck size={10} />, <Clock size={10} />].map((icon, i) => (
                        <span key={i} className="text-[10px] text-emerald-500/70 flex items-center gap-1">
                          {icon}{['ปลอดภัย', 'PDPA 2562', 'ชั่วคราว'][i]}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>

                <button onClick={handleCheckin} disabled={actionLoading || !pdpaConsent}
                  className="w-full bg-hotel-accent hover:bg-hotel-glow disabled:bg-slate-700 disabled:text-slate-500 text-hotel-dark font-bold py-4 rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-hotel-accent/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none text-base"
                >
                  {actionLoading
                    ? <><Loader2 className="w-5 h-5 animate-spin" />กำลังดำเนินการ...</>
                    : <><KeyRound className="w-5 h-5" />Check-in · เปิดระบบไฟ</>
                  }
                </button>
              </div>

              {/* Help card */}
              <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 grid grid-cols-3 gap-3">
                {[
                  { icon: <Wifi size={16} />, label: 'WiFi ฟรี', sub: 'ดูรหัสในห้อง' },
                  { icon: <Phone size={16} />, label: 'แผนกต้อนรับ', sub: 'กด 0' },
                  { icon: <Video size={16} />, label: 'วิดีโอคอล', sub: 'ขอความช่วยเหลือ' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 text-center">
                    <div className="text-hotel-city opacity-70">{item.icon}</div>
                    <p className="text-white text-[11px] font-medium">{item.label}</p>
                    <p className="text-slate-600 text-[10px]">{item.sub}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── CHECKED-IN VIEW ─────────────────────── */}
          {status === 'checked-in' && (
            <motion.div key="in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Power control */}
              <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl p-5 border border-white/8">
                <PowerToggle roomPower={roomPower} onToggle={handleTogglePower} loading={actionLoading} />
              </div>

              {/* Countdown */}
              <div className="bg-slate-900/50 rounded-2xl px-5 py-4 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock size={14} />
                  <span className="text-xs">สิทธิ์ควบคุมหมดใน</span>
                </div>
                <span className="text-hotel-accent font-bold text-sm">{timeLeftStr || 'กำลังคำนวณ...'}</span>
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-3">
                <a href="tel:0" className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 flex flex-col items-center gap-2 hover:bg-white/5 transition-colors group">
                  <Phone size={20} className="text-hotel-city group-hover:text-white transition-colors" />
                  <span className="text-xs text-slate-400 group-hover:text-white transition-colors">โทรแผนกต้อนรับ</span>
                </a>
                <a href="https://meet.google.com/new" target="_blank" rel="noreferrer"
                  className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 flex flex-col items-center gap-2 hover:bg-white/5 transition-colors group"
                >
                  <Video size={20} className="text-hotel-city group-hover:text-white transition-colors" />
                  <span className="text-xs text-slate-400 group-hover:text-white transition-colors">วิดีโอคอลพนักงาน</span>
                </a>
              </div>

              {/* Checkout */}
              <button onClick={handleCheckout} disabled={actionLoading}
                className="w-full bg-rose-600/80 hover:bg-rose-500 border border-rose-500/30 hover:shadow-[0_0_20px_rgba(244,63,94,0.25)] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-40"
              >
                {actionLoading
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <><LogOut className="w-5 h-5" />Check-out · คืนห้องและดับไฟ</>
                }
              </button>

              {/* Success indicator */}
              <div className="flex items-center justify-center gap-2 text-emerald-400/60 text-[10px]">
                <CheckCircle2 size={12} />
                <span>เช็คอินสำเร็จ · ยินดีต้อนรับสู่โรงแรม</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <p className="text-center text-slate-700 text-[10px] tracking-widest mt-2">
          HOTEL ECS · PDPA COMPLIANT · SMART SELF-SERVICE
        </p>
      </motion.div>
    </div>
  );
};

export default GuestView;
