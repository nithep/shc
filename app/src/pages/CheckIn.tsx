import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  QrCode, Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle,
  Loader2, ChevronRight, User, Mail, Shield, ArrowLeft, Wifi, Phone,
  Hotel, Sparkles, KeyRound, Clock, BadgeCheck
} from 'lucide-react';
import { api, pdpa } from '../lib/api';

// ─── Type Definitions ────────────────────────────────────────────────────────
interface CheckInData {
  roomNumber: string;
  guestName: string;
  guestEmail?: string;
}

type Step = 'scan' | 'confirm' | 'pdpa' | 'done';

// ─── Step Indicator Component ─────────────────────────────────────────────────
const StepIndicator = ({ current }: { current: Step }) => {
  const steps: { id: Step; label: string }[] = [
    { id: 'scan', label: 'สแกน' },
    { id: 'confirm', label: 'ข้อมูล' },
    { id: 'pdpa', label: 'ยืนยัน' },
    { id: 'done', label: 'เสร็จสิ้น' },
  ];
  const currentIdx = steps.findIndex(s => s.id === current);

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, idx) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
              idx < currentIdx ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
              idx === currentIdx ? 'bg-hotel-accent text-hotel-dark shadow-lg shadow-hotel-accent/30 scale-110' :
              'bg-slate-800 text-slate-500 border border-slate-700'
            }`}>
              {idx < currentIdx ? <CheckCircle2 size={14} /> : idx + 1}
            </div>
            <span className={`text-[9px] uppercase tracking-wider font-semibold transition-colors ${
              idx === currentIdx ? 'text-hotel-accent' : idx < currentIdx ? 'text-emerald-400' : 'text-slate-600'
            }`}>{step.label}</span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`h-px flex-1 max-w-8 mb-4 transition-all duration-500 ${
              idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-700'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Main CheckIn Page ────────────────────────────────────────────────────────
const CheckIn: React.FC = () => {
  const [step, setStep] = useState<Step>('scan');
  const [scanning, setScanning] = useState(false);
  const [checkInData, setCheckInData] = useState<CheckInData | null>(null);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [isManual, setIsManual] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    codeReader.current = new BrowserMultiFormatReader();
    
    // ตรวจหาคิวรีพารามิเตอร์ ?room= ใน URL เพื่ออำนวยความสะดวกให้แขกข้ามขั้นตอนสแกนกล้องได้
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      let roomNum = roomParam.trim();
      // หากส่งมาเป็น URL เต็ม ให้แกะเฉพาะเลขห้องออกมา
      const match = roomNum.match(/[?&]room=(\d+)/);
      if (match) {
        roomNum = match[1];
      }
      setCheckInData({
        roomNumber: roomNum,
        guestName: '',
      });
      setIsManual(false);
      setStep('confirm');
    }

    return () => { stopScanning(); };
  }, []);

  const startScanning = async () => {
    try {
      setError(''); setCameraError('');
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (devices.length === 0) { setCameraError('ไม่พบกล้องบนอุปกรณ์นี้'); return; }
      const backCamera = devices.find(d => /back|rear|environment/i.test(d.label));
      const deviceId = backCamera?.deviceId || devices[0].deviceId;
      await codeReader.current!.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
        if (result) { handleScanResult(result.getText()); stopScanning(); }
      });
      setScanning(true);
    } catch {
      setCameraError('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์');
    }
  };

  const stopScanning = () => {
    (codeReader.current as any)?.reset?.();
    setScanning(false);
  };

  const handleScanResult = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (!data.room) throw new Error('Invalid QR');
      setCheckInData({ roomNumber: data.room, guestName: data.name || '', guestEmail: data.email });
    } catch {
      let roomNum = text.trim();
      // หากสแกนได้ URL เต็ม ให้แกะเฉพาะเลขห้อง
      const match = roomNum.match(/[?&]room=(\d+)/);
      if (match) {
        roomNum = match[1];
      } else {
        const parts = roomNum.split('/');
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart)) {
          roomNum = lastPart;
        }
      }
      setCheckInData({ roomNumber: roomNum, guestName: '' });
    }
    setIsManual(false);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!checkInData?.guestName.trim()) { setError('กรุณากรอกชื่อผู้เข้าพัก'); return; }
    setLoading(true); setError('');
    try {
      await api.checkIn({
        roomNumber: checkInData.roomNumber,
        guestName: checkInData.guestName,
        guestEmail: checkInData.guestEmail,
        pdpaConsent: { privacyPolicyAccepted: true, acceptedAt: new Date().toISOString() },
      });
      pdpa.setConsentGiven(true);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเช็คอิน กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('scan'); setCheckInData(null); setPdpaConsent(false);
    setError(''); setCameraError(''); setIsManual(false);
  };

  return (
    <div className="min-h-screen bg-hotel-dark flex flex-col items-center justify-start p-4 pt-10 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-64 bg-hotel-accent/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-purple-600/10 blur-[60px] rounded-full pointer-events-none" />

      <motion.div
        key="main-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        {/* ── Header ─────────────────────────────── */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 250, delay: 0.1 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-hotel-accent/20 to-hotel-glow/20 rounded-2xl mb-4 border border-hotel-accent/30 shadow-[0_0_30px_rgba(56,189,248,0.2)]"
          >
            <Hotel className="w-8 h-8 text-hotel-accent" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Self Check-in</h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase">Hotel ECS · Guest Service</p>
        </div>

        {/* ── Step Indicator ──────────────────────── */}
        {step !== 'done' && <StepIndicator current={step} />}

        {/* ── Card ────────────────────────────────── */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-white/8 shadow-2xl overflow-hidden">
          <AnimatePresence mode="wait">

            {/* STEP 1: SCAN */}
            {step === 'scan' && (
              <motion.div
                key="scan"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="p-6 space-y-4"
              >
                <div className="space-y-1 mb-2">
                  <h2 className="font-bold text-white text-lg">สแกน QR Code ห้องพัก</h2>
                  <p className="text-slate-400 text-sm">ชี้กล้องไปที่ QR Code ที่ประตูห้องพักของคุณ</p>
                </div>

                {/* Camera View */}
                <div className="relative aspect-square bg-black/60 rounded-2xl overflow-hidden border border-white/10">
                  <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${scanning ? 'block' : 'hidden'}`}
                    autoPlay
                    playsInline
                    muted
                  />
                  {scanning ? (
                    <>
                      {/* Scan overlay frame */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative w-48 h-48">
                          {/* Corner borders */}
                          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(c => (
                            <div key={c} className={`absolute w-8 h-8 border-hotel-accent border-opacity-80 ${
                              c === 'top-left' ? 'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg' :
                              c === 'top-right' ? 'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg' :
                              c === 'bottom-left' ? 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg' :
                              'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg'
                            }`} />
                          ))}
                          {/* Scan line */}
                          <motion.div
                            animate={{ y: [0, 160, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-hotel-accent to-transparent rounded-full shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                          />
                        </div>
                      </div>
                      <button
                        onClick={stopScanning}
                        className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white p-2 rounded-xl border border-white/10 hover:bg-red-500/80 transition-colors z-10"
                      >
                        <CameraOff size={16} />
                      </button>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
                      <QrCode size={56} className="opacity-30" />
                      <p className="text-sm opacity-60">กดปุ่มด้านล่างเพื่อเปิดกล้อง</p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3"
                  >
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-amber-300 text-xs leading-relaxed">{cameraError}</p>
                  </motion.div>
                )}

                <button
                  onClick={scanning ? stopScanning : startScanning}
                  className="w-full bg-hotel-accent hover:bg-hotel-glow text-hotel-dark font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-hotel-accent/20 active:scale-[0.98]"
                >
                  {scanning ? <><CameraOff size={20} />หยุดสแกน</> : <><Camera size={20} />เปิดกล้องสแกน QR Code</>}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-slate-600 text-xs">หรือ</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                {/* Manual entry fallback */}
                <button
                  onClick={() => {
                    setCheckInData({ roomNumber: '', guestName: '' });
                    setIsManual(true);
                    setStep('confirm');
                  }}
                  className="w-full py-3 rounded-2xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <User size={16} />
                  กรอกข้อมูลด้วยตนเอง
                </button>

                {/* Help footer */}
                <div className="flex items-center justify-center gap-4 pt-2">
                  <a href="tel:reception" className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-hotel-accent transition-colors">
                    <Phone size={12} />แผนกต้อนรับ
                  </a>
                  <span className="text-slate-700">·</span>
                  <a href="/wifi-guide" className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-hotel-accent transition-colors">
                    <Wifi size={12} />ข้อมูล WiFi
                  </a>
                </div>
              </motion.div>
            )}

            {/* STEP 2: CONFIRM DATA */}
            {step === 'confirm' && checkInData !== null && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="p-6 space-y-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={() => setStep('scan')} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h2 className="font-bold text-white text-lg leading-tight">ยืนยันข้อมูล</h2>
                    <p className="text-slate-500 text-xs">กรุณาตรวจสอบข้อมูลก่อนดำเนินการ</p>
                  </div>
                </div>

                {/* Room Number Display or Input based on isManual */}
                {!isManual ? (
                  <div className="bg-gradient-to-r from-hotel-accent/10 to-hotel-glow/10 border border-hotel-accent/20 rounded-2xl p-5 text-center relative">
                    <p className="text-xs text-hotel-accent uppercase tracking-widest mb-2 font-semibold">ห้องพักหมายเลข</p>
                    <p className="text-5xl font-light text-white tracking-tighter drop-shadow-[0_0_20px_rgba(56,189,248,0.4)]">
                      {checkInData.roomNumber || '—'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsManual(true)}
                      className="absolute top-2 right-2 text-[10px] bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-all"
                    >
                      แก้ไข
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider">หมายเลขห้อง *</label>
                    <input
                      type="text" placeholder="เช่น 101, 202"
                      value={checkInData.roomNumber}
                      onChange={e => setCheckInData(p => ({ ...p!, roomNumber: e.target.value }))}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-hotel-accent/50 focus:border-hotel-accent/50 transition-all text-center text-2xl font-bold tracking-widest"
                      autoFocus
                    />
                  </div>
                )}

                {/* Guest Name */}
                <div>
                  <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={12} />ชื่อผู้เข้าพัก *
                  </label>
                  <input
                    type="text" placeholder="ชื่อ-นามสกุล"
                    value={checkInData.guestName}
                    onChange={e => setCheckInData(p => ({ ...p!, guestName: e.target.value }))}
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-hotel-accent/50 focus:border-hotel-accent/50 transition-all"
                  />
                </div>

                {/* Email (optional) */}
                <div>
                  <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Mail size={12} />อีเมล <span className="text-slate-600 normal-case">(รับใบเสร็จ)</span>
                  </label>
                  <input
                    type="email" placeholder="example@email.com"
                    value={checkInData.guestEmail || ''}
                    onChange={e => setCheckInData(p => ({ ...p!, guestEmail: e.target.value }))}
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-hotel-accent/50 focus:border-hotel-accent/50 transition-all"
                  />
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3"
                  >
                    <XCircle size={16} className="text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-xs">{error}</p>
                  </motion.div>
                )}

                <button
                  onClick={() => {
                    if (!checkInData.roomNumber.trim()) { setError('กรุณากรอกหมายเลขห้อง'); return; }
                    if (!checkInData.guestName.trim()) { setError('กรุณากรอกชื่อผู้เข้าพัก'); return; }
                    setError(''); setStep('pdpa');
                  }}
                  className="w-full bg-hotel-accent hover:bg-hotel-glow text-hotel-dark font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-hotel-accent/20 active:scale-[0.98]"
                >
                  ถัดไป <ChevronRight size={18} />
                </button>
              </motion.div>
            )}

            {/* STEP 3: PDPA CONSENT */}
            {step === 'pdpa' && (
              <motion.div
                key="pdpa"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="p-6 space-y-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={() => setStep('confirm')} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h2 className="font-bold text-white text-lg leading-tight">ความเป็นส่วนตัว</h2>
                    <p className="text-slate-500 text-xs">กรุณาอ่านและยืนยันก่อนดำเนินการ</p>
                  </div>
                </div>

                {/* Summary card */}
                <div className="bg-hotel-accent/5 border border-hotel-accent/15 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">ห้องพัก</span>
                    <span className="text-white font-bold">{checkInData?.roomNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">ชื่อผู้เข้าพัก</span>
                    <span className="text-white font-medium">{checkInData?.guestName}</span>
                  </div>
                  {checkInData?.guestEmail && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">อีเมล</span>
                      <span className="text-white font-medium text-xs">{checkInData.guestEmail}</span>
                    </div>
                  )}
                </div>

                {/* PDPA box */}
                <div className="bg-slate-950/60 border border-white/8 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={16} className="text-hotel-accent" />
                    <h3 className="text-white font-semibold text-sm">นโยบายความเป็นส่วนตัว (PDPA)</h3>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    ข้อมูลของท่านจะถูกเก็บรวบรวมเพื่อการเข้าพักและออกใบเสร็จเท่านั้น
                    โดยอยู่ภายใต้พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
                    ข้อมูลทั้งหมดจะถูกลบโดยอัตโนมัติภายหลังการเช็คเอาท์
                  </p>
                  <div className="flex gap-3 pt-1">
                    {[
                      { icon: <Clock size={12} />, text: 'เก็บข้อมูลชั่วคราว' },
                      { icon: <Shield size={12} />, text: 'ปลอดภัย 100%' },
                      { icon: <BadgeCheck size={12} />, text: 'ตาม PDPA 2562' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-1 text-emerald-400/80 text-[10px]">
                        {item.icon}<span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Consent checkbox */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox" checked={pdpaConsent} onChange={e => setPdpaConsent(e.target.checked)}
                      className="peer appearance-none w-5 h-5 border-2 border-slate-600 rounded-md checked:bg-hotel-accent checked:border-hotel-accent focus:outline-none focus:ring-2 focus:ring-hotel-accent/30 transition-all cursor-pointer"
                    />
                    <CheckCircle2 className="absolute inset-0 w-5 h-5 text-hotel-dark opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity scale-90" />
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed group-hover:text-white transition-colors">
                    ข้าพเจ้าได้อ่านและ<strong className="text-white">ยินยอม</strong>ให้รวบรวมข้อมูลส่วนบุคคลตามนโยบายข้างต้น
                  </p>
                </label>

                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3"
                  >
                    <XCircle size={16} className="text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-xs">{error}</p>
                  </motion.div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading || !pdpaConsent}
                  className="w-full bg-hotel-accent hover:bg-hotel-glow disabled:bg-slate-700 disabled:text-slate-500 text-hotel-dark font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-hotel-accent/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {loading ? (
                    <><Loader2 size={20} className="animate-spin" />กำลังดำเนินการ...</>
                  ) : (
                    <><KeyRound size={20} />ยืนยัน & เช็คอิน</>
                  )}
                </button>
              </motion.div>
            )}

            {/* STEP 4: SUCCESS */}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
                className="p-8 text-center space-y-5"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="w-24 h-24 mx-auto bg-emerald-500/15 rounded-full flex items-center justify-center ring-2 ring-emerald-400/30 shadow-[0_0_40px_rgba(16,185,129,0.3)]"
                >
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                </motion.div>

                <div>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <h2 className="text-2xl font-bold text-white mb-2">เช็คอินสำเร็จ! 🎉</h2>
                    <p className="text-slate-400 text-sm">ยินดีต้อนรับสู่โรงแรมของเรา</p>
                  </motion.div>
                </div>

                {/* Room info */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="bg-emerald-500/8 border border-emerald-400/20 rounded-2xl p-5 text-center"
                >
                  <p className="text-xs text-emerald-400 uppercase tracking-widest mb-2">ห้องพักของคุณ</p>
                  <p className="text-5xl font-light text-white tracking-tighter mb-3">{checkInData?.roomNumber}</p>
                  <p className="text-slate-400 text-xs">เสียบคีย์การ์ดเพื่อเปิดไฟในห้อง</p>
                </motion.div>

                {/* Tips */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="grid grid-cols-3 gap-3"
                >
                  {[
                    { icon: <Wifi size={18} />, text: 'WiFi ฟรี', sub: 'ดูรหัสในห้อง' },
                    { icon: <Phone size={18} />, text: 'โทรแจ้ง', sub: 'กด 0 โรงแรม' },
                    { icon: <Clock size={18} />, text: 'Check-out', sub: 'ก่อน 12:00 น.' },
                  ].map((tip, i) => (
                    <div key={i} className="bg-slate-800/60 rounded-xl p-3 text-center border border-white/5">
                      <div className="text-hotel-accent mb-1 flex justify-center">{tip.icon}</div>
                      <p className="text-white text-xs font-medium">{tip.text}</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">{tip.sub}</p>
                    </div>
                  ))}
                </motion.div>

                <motion.button
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                  onClick={resetAll}
                  className="w-full py-3 rounded-2xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} />
                  เช็คอินผู้เข้าพักรายถัดไป
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-700 text-[10px] mt-6 tracking-wider">
          HOTEL ECS · SMART SELF-SERVICE · PDPA COMPLIANT
        </p>
      </motion.div>
    </div>
  );
};

export default CheckIn;
