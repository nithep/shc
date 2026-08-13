import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, CheckCircle2, XCircle, Bed, User, ArrowRight, CameraOff, Lock, Smartphone } from 'lucide-react';
import liff from '@line/liff';
import { BrowserMultiFormatReader } from '@zxing/browser';

type ScanStatus =
  | 'idle'
  | 'liff_scanning'
  | 'camera_active'
  | 'scanned'
  | 'processing'
  | 'success'
  | 'error'
  | 'permission_denied'
  | 'insecure_context'
  | 'liff_unavailable';

type FlowType = 'checkin' | 'checkout';

// ── Safe: ตรวจ LINE Browser จาก UserAgent เท่านั้น (ไม่แตะ LIFF SDK) ──────
const detectLineBrowser = (): boolean => {
  try {
    return /Line\//i.test(navigator.userAgent);
  } catch {
    return false;
  }
};

const Scan = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [flow, setFlow] = useState<FlowType>('checkin');
  const [selectedRoom, setSelectedRoom] = useState<string>(searchParams.get('room') || '');
  const [guestName, setGuestName] = useState<string>('');
  const [pdpaConsent, setPdpaConsent] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lineProfile, setLineProfile] = useState<any>(null);

  // ── สถานะ LIFF ที่รู้หลังจาก init แล้วเท่านั้น ──────────────────────────
  const [liffReady, setLiffReady] = useState<boolean>(false);
  const [isInLineClient, setIsInLineClient] = useState<boolean>(detectLineBrowser()); // ค่าเริ่มต้น = UserAgent
  const [liffScanV2, setLiffScanV2] = useState<boolean>(false);
  const [liffScanV1, setLiffScanV1] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>('initializing...');

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);

  // ══════════════════════════════════════════════════════════════════════════
  // LIFF Init (async — ไม่บล็อก render)
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    codeReader.current = new BrowserMultiFormatReader();

    const initLiff = async () => {
      try {
        const liffId = import.meta.env.VITE_LIFF_ID || '2010634930-gRJCLqbu';
        console.log('[LIFF] Initializing ID:', liffId);
        await liff.init({ liffId });

        // ── อ่านค่าหลัง init เสร็จเท่านั้น ──
        const inClient = liff.isInClient();
        const loggedIn  = liff.isLoggedIn();
        const scanV2    = liff.isApiAvailable('scanCodeV2');
        const scanV1    = liff.isApiAvailable('scanCode');
        const uaLine    = detectLineBrowser();

        const info = `UA-LINE=${uaLine} | inClient=${inClient} | loggedIn=${loggedIn} | scanV2=${scanV2} | scanV1=${scanV1}`;
        console.log('[LIFF]', info);
        setDebugInfo(info);

        // ── อัปเดต state ──
        setIsInLineClient(inClient || uaLine);
        setLiffScanV2(scanV2);
        setLiffScanV1(scanV1);
        setLiffReady(true);

        // โหลด Profile ถ้า login แล้ว
        if (loggedIn) {
          try {
            const profile = await liff.getProfile();
            setLineProfile(profile);
            setGuestName(profile.displayName);
            console.log('[LIFF] Profile:', profile.displayName);
          } catch (profileErr) {
            console.warn('[LIFF] Profile error:', profileErr);
          }
        }
        // ถ้าอยู่ใน LINE แต่ยังไม่ login — redirect
        else if (inClient) {
          console.log('[LIFF] Not logged in inside LINE — redirecting...');
          liff.login();
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error('[LIFF] Init error:', msg);
        setDebugInfo(`LIFF init failed: ${msg}`);
        setLiffReady(false);
        // ยังอยู่ใน LINE browser แม้ init ล้มเหลว
        setIsInLineClient(detectLineBrowser());
      }
    };

    initLiff();

    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    try {
      (codeReader.current as any)?.reset?.();
    } catch { /* ignore */ }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Main Scan Entry Point
  // ══════════════════════════════════════════════════════════════════════════
  const startCamera = async () => {
    setErrorMsg('');
    console.log('[SCAN] startCamera | isInLineClient:', isInLineClient, '| liffReady:', liffReady);

    if (isInLineClient) {
      await startLiffScanner();
    } else {
      await startWebCamera();
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LIFF Native Scanner
  // ══════════════════════════════════════════════════════════════════════════
  const startLiffScanner = async () => {
    setStatus('liff_scanning');

    // ถ้า LIFF ยังไม่ init ให้รอสั้นๆ
    if (!liffReady) {
      console.log('[LIFF] Waiting for init...');
      await new Promise((r) => setTimeout(r, 1500));
    }

    try {
      // ── ลอง scanCodeV2 ──
      if (liffScanV2 || liff.isApiAvailable('scanCodeV2')) {
        console.log('[LIFF] Calling scanCodeV2...');
        const result = await liff.scanCodeV2();
        console.log('[LIFF] scanCodeV2 result:', result);
        if (result?.value) { handleQRResult(result.value); return; }
      }

      // ── Fallback scanCode ──
      if (liffScanV1 || liff.isApiAvailable('scanCode')) {
        console.log('[LIFF] Calling scanCode...');
        const result = await (liff as any).scanCode();
        console.log('[LIFF] scanCode result:', result);
        if (result?.value) { handleQRResult(result.value); return; }
      }

      // ทั้งคู่ไม่พร้อม
      setStatus('liff_unavailable');
      setErrorMsg('LINE Scanner ยังไม่พร้อม กรุณาอัปเดต LINE และเปิดใหม่อีกครั้ง');

    } catch (err: any) {
      const code = err?.errorCode || '';
      const msg  = err?.message || String(err);
      console.error('[LIFF] Scanner error:', code, msg);

      // ผู้ใช้ยกเลิก → กลับ idle เงียบๆ
      if (code === 'USER_CANCELLED' || msg.toLowerCase().includes('cancel')) {
        setStatus('idle');
        return;
      }
      setStatus('liff_unavailable');
      setErrorMsg(`เปิดกล้อง LINE ไม่สำเร็จ: ${msg}`);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Web Camera (สำหรับ Browser ทั่วไป)
  // ══════════════════════════════════════════════════════════════════════════
  const startWebCamera = async () => {
    const secure =
      window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost';

    if (!secure) { setStatus('insecure_context'); return; }
    setStatus('camera_active');

    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (devices.length === 0) {
        setStatus('permission_denied');
        setErrorMsg('ไม่พบกล้องในอุปกรณ์นี้');
        return;
      }
      const back = devices.find(d =>
        /back|environment|rear/i.test(d.label)
      );
      await codeReader.current!.decodeFromVideoDevice(
        back ? back.deviceId : devices[0].deviceId,
        videoRef.current!,
        (result, err) => {
          if (result) handleQRResult(result.getText());
          if (err && err.name !== 'NotFoundException') console.error('[CAM]', err);
        }
      );
    } catch (err: any) {
      setStatus('permission_denied');
      setErrorMsg(
        err?.name === 'NotAllowedError'
          ? 'กรุณาอนุญาตการใช้งานกล้องในการตั้งค่า Browser'
          : `กล้องเปิดไม่สำเร็จ: ${err?.message || err}`
      );
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // QR Result Parser
  // ══════════════════════════════════════════════════════════════════════════
  const handleQRResult = (data: string) => {
    stopCamera();
    let roomNum = data.trim();
    try {
      if (data.startsWith('{')) {
        const p = JSON.parse(data);
        if (p.room) roomNum = String(p.room);
      } else if (data.startsWith('http')) {
        const url = new URL(data);
        roomNum = url.searchParams.get('room') ?? roomNum;
      }
    } catch { /* keep raw */ }
    console.log('[SCAN] Room:', roomNum);
    setSelectedRoom(roomNum);
    setStatus('scanned');
  };

  // ══════════════════════════════════════════════════════════════════════════
  // API Call
  // ══════════════════════════════════════════════════════════════════════════
  const handleProcessAction = async () => {
    if (!selectedRoom) { setErrorMsg('กรุณาเลือกห้องพัก'); setStatus('error'); return; }
    if (flow === 'checkin' && !guestName.trim()) { setErrorMsg('กรุณากรอกชื่อผู้เข้าพัก'); setStatus('error'); return; }
    if (flow === 'checkin' && !pdpaConsent) { setErrorMsg('กรุณายินยอม PDPA ก่อนเช็คอิน'); setStatus('error'); return; }

    setStatus('processing');
    setErrorMsg('');

    try {
      const endpoint = flow === 'checkin' ? '/api/checkin' : '/api/checkout';
      const payload = flow === 'checkin'
        ? { roomNumber: selectedRoom, guestName, pdpaConsent: { privacyPolicyAccepted: true, acceptedAt: new Date().toISOString() } }
        : { roomNumber: selectedRoom };

      const token = localStorage.getItem(`hotel_guest_token_${selectedRoom}`);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await response.json();

      if (response.status === 202 && data.reason === 'APPROVAL_REQUIRED') {
        setStatus('success');
      } else if (response.ok && (data.hardware_status?.success || data.success || data.message)) {
        if (data.token) {
          localStorage.setItem(`hotel_guest_token_${selectedRoom}`, data.token);
          localStorage.setItem('user_role', 'guest');
          const checkoutDate = data.checkoutDate || data.checkout_date;
          if (checkoutDate) {
            localStorage.setItem(`hotel_guest_checkout_${selectedRoom}`, checkoutDate);
          } else {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(12, 0, 0, 0);
            localStorage.setItem(`hotel_guest_checkout_${selectedRoom}`, tomorrow.toISOString());
          }
        }
        setStatus('success');
      } else {
        setErrorMsg(data.error || 'เกิดข้อผิดพลาดในการสั่งการระบบไฟ');
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
      setStatus('error');
    }
  };

  const handleReset = () => {
    stopCamera();
    setStatus('idle');
    setSelectedRoom('');
    setGuestName(lineProfile?.displayName || '');
    setPdpaConsent(false);
    setErrorMsg('');
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-xl mx-auto flex flex-col items-center justify-center min-h-[75vh] px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-hotel-accent to-slate-400">
          เช็คอินโรงแรม
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-sm mx-auto">
          สแกน QR Code หรือกรอกข้อมูลด้วยตนเอง
        </p>
      </div>

      <div className="w-full glass-panel rounded-3xl p-6 shadow-2xl relative overflow-hidden bg-slate-900/60 backdrop-blur-2xl border border-white/10">
        <div className="absolute -left-16 -bottom-16 w-36 h-36 rounded-full blur-3xl opacity-20 bg-hotel-accent" />
        <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full blur-3xl opacity-20 bg-hotel-accent" />

        <AnimatePresence mode="wait">

          {/* IDLE */}
          {status === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="py-8 flex flex-col items-center justify-center text-center space-y-6">
              <div
                className="relative w-64 h-64 border-2 border-hotel-accent/30 rounded-3xl overflow-hidden bg-slate-950/70 flex flex-col items-center justify-center cursor-pointer hover:border-hotel-accent/70 transition-all duration-300 group"
                onClick={startCamera}>
                <QrCode size={72} className="text-hotel-accent/40 group-hover:text-hotel-accent group-hover:scale-110 transition-all duration-300" />
                <span className="mt-4 text-xs font-bold text-hotel-accent/60 group-hover:text-hotel-accent uppercase tracking-wider">
                  {isInLineClient ? 'แตะเพื่อเปิดกล้อง LINE' : 'แตะเพื่อสแกน'}
                </span>
                {isInLineClient && (
                  <span className="mt-1 text-[10px] text-green-400/60 flex items-center gap-1">
                    <Smartphone size={10} /> LINE Native Scanner
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">กดปุ่มด้านล่างเพื่อเริ่มสแกน</p>
              <button onClick={startCamera}
                className="w-full py-4 bg-gradient-to-r from-hotel-accent to-amber-600 hover:from-amber-500 hover:to-hotel-accent text-white rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] flex items-center justify-center gap-2">
                <QrCode size={18} /> สแกน QR Code
              </button>
              <button onClick={() => setStatus('scanned')} className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors">
                ไม่มี QR Code? กรอกข้อมูลด้วยตนเอง
              </button>
            </motion.div>
          )}

          {/* LIFF SCANNING */}
          {status === 'liff_scanning' && (
            <motion.div key="liff_scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-16 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full blur-xl bg-green-500/30 animate-pulse" />
                <div className="bg-green-950/50 text-green-400 rounded-full p-5 border-2 border-green-500/50 relative z-10">
                  <Smartphone size={48} className="animate-bounce" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-green-400">กำลังเปิดกล้อง LINE...</p>
                <p className="text-sm text-slate-400 mt-2">หน้าต่างสแกน QR จะเปิดขึ้นทันที</p>
                <p className="text-xs text-slate-500 mt-1">หากไม่เปิด กรุณากด "ยกเลิก" แล้วลองใหม่</p>
              </div>
              <button onClick={() => setStatus('idle')}
                className="px-6 py-2.5 bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-all">
                ยกเลิก / ลองใหม่
              </button>
            </motion.div>
          )}

          {/* WEB CAMERA */}
          {status === 'camera_active' && (
            <motion.div key="camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center space-y-6">
              <div className="relative w-full aspect-square max-w-sm rounded-3xl overflow-hidden border-2 border-hotel-accent shadow-[0_0_30px_rgba(212,175,55,0.2)] bg-black">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                <div className="absolute inset-0 z-10 pointer-events-none">
                  <motion.div animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="absolute left-0 right-0 h-1 bg-hotel-accent shadow-[0_0_20px_rgba(212,175,55,1)]" />
                  <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-hotel-accent rounded-tl-xl" />
                  <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-hotel-accent rounded-tr-xl" />
                  <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-hotel-accent rounded-bl-xl" />
                  <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-hotel-accent rounded-br-xl" />
                </div>
              </div>
              <p className="text-sm font-bold text-slate-200 animate-pulse">จัด QR Code ให้อยู่ในกรอบ</p>
              <button onClick={() => { stopCamera(); setStatus('idle'); }}
                className="px-6 py-2.5 bg-rose-950/50 hover:bg-rose-900/80 border border-rose-900/50 text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CameraOff size={16} /> ปิดกล้อง
              </button>
            </motion.div>
          )}

          {/* LIFF UNAVAILABLE */}
          {status === 'liff_unavailable' && (
            <motion.div key="liff_unavailable" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-amber-950/30 text-amber-400 rounded-full p-5 border border-amber-800"><Smartphone size={48} /></div>
              <h3 className="text-xl font-bold text-amber-400">กล้องเปิดไม่ได้</h3>
              <p className="text-sm text-slate-300 max-w-sm leading-relaxed">{errorMsg || 'ไม่สามารถเปิดกล้อง LINE ได้'}</p>
              <button onClick={startCamera}
                className="w-full py-3 bg-hotel-accent/20 border border-hotel-accent/50 hover:bg-hotel-accent/40 text-hotel-accent rounded-xl text-sm font-bold transition-all">
                ลองใหม่อีกครั้ง
              </button>
              <button onClick={() => setStatus('scanned')} className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors">
                กรอกข้อมูลด้วยตนเอง
              </button>
            </motion.div>
          )}

          {/* PERMISSION DENIED */}
          {status === 'permission_denied' && (
            <motion.div key="denied" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-amber-950/30 text-amber-400 rounded-full p-5 border border-amber-800"><CameraOff size={48} /></div>
              <h3 className="text-xl font-bold text-amber-400">ไม่สามารถเข้าถึงกล้องได้</h3>
              <p className="text-sm text-slate-300 max-w-sm">{errorMsg || 'กรุณาอนุญาตการใช้งานกล้องในการตั้งค่า'}</p>
              <button onClick={startCamera}
                className="w-full py-3 bg-hotel-accent/20 border border-hotel-accent/50 hover:bg-hotel-accent/40 text-hotel-accent rounded-xl text-sm font-bold transition-all">
                ลองอีกครั้ง
              </button>
              <button onClick={() => setStatus('scanned')} className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors">
                กรอกข้อมูลด้วยตนเอง
              </button>
            </motion.div>
          )}

          {/* INSECURE */}
          {status === 'insecure_context' && (
            <motion.div key="insecure" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-rose-950/30 text-rose-400 rounded-full p-5 border border-rose-800"><Lock size={48} className="animate-pulse" /></div>
              <h3 className="text-xl font-bold text-rose-400">การเชื่อมต่อไม่ปลอดภัย</h3>
              <p className="text-sm text-slate-300 max-w-sm">กรุณาเข้าใช้งานผ่าน <strong>https://hotel.nithep.com</strong></p>
              <button onClick={handleReset} className="px-6 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-400 rounded-xl text-xs font-semibold transition-all">กลับไปหน้าหลัก</button>
            </motion.div>
          )}

          {/* FORM */}
          {status === 'scanned' && (
            <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900 shadow-inner">
                {(['checkin', 'checkout'] as FlowType[]).map((f) => (
                  <button key={f} onClick={() => setFlow(f)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${flow === f ? 'bg-hotel-card text-hotel-accent border border-hotel-accent/30 shadow-[0_0_15px_rgba(212,175,55,0.15)]' : 'text-slate-500 hover:text-slate-300'}`}>
                    {f === 'checkin' ? '📥 เช็คอิน' : '📤 เช็คเอาท์'}
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Bed size={14} className="text-hotel-accent" /> หมายเลขห้องพัก
                  </label>
                  <input type="text" value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} placeholder="เช่น 101"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-hotel-accent focus:ring-1 focus:ring-hotel-accent rounded-xl py-3 px-4 text-hotel-accent text-lg font-bold outline-none transition-all shadow-inner" />
                </div>
                {flow === 'checkin' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <User size={14} className="text-hotel-accent" /> ชื่อผู้เข้าพัก
                    </label>
                    {lineProfile ? (
                      <div className="flex items-center gap-4 bg-[#00B900]/10 border border-[#00B900]/30 p-3 rounded-xl">
                        <img src={lineProfile.pictureUrl} alt="LINE" className="w-10 h-10 rounded-full border-2 border-[#00B900]" />
                        <div>
                          <p className="text-xs text-[#00B900] font-bold">ยืนยันตัวตนผ่าน LINE ✓</p>
                          <p className="text-white text-sm font-medium">{lineProfile.displayName}</p>
                        </div>
                      </div>
                    ) : (
                      <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="กรอกชื่อ-นามสกุล..."
                        className="w-full bg-slate-950 border border-slate-800 focus:border-hotel-accent focus:ring-1 focus:ring-hotel-accent rounded-xl py-3 px-4 text-slate-200 text-sm outline-none transition-all shadow-inner" />
                    )}
                  </div>
                )}
              </div>
              {flow === 'checkin' && (
                <div className="flex items-start gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <input type="checkbox" id="pdpa-scan" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-700 text-hotel-accent cursor-pointer" />
                  <label htmlFor="pdpa-scan" className="text-xs text-slate-400 cursor-pointer leading-relaxed">
                    ข้าพเจ้ายินยอมให้โรงแรมเก็บข้อมูลส่วนบุคคลเพื่อการเข้าพัก
                    <span className="text-emerald-500/70 block mt-1 font-medium">* ข้อมูลจะถูกลบอัตโนมัติเมื่อเช็คเอาท์</span>
                  </label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={handleReset}
                  className="px-4 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-xl font-bold text-sm transition-all">
                  ยกเลิก
                </button>
                <button onClick={handleProcessAction}
                  disabled={!selectedRoom || (flow === 'checkin' && (!guestName.trim() || !pdpaConsent))}
                  className="flex-1 py-4 bg-gradient-to-r from-hotel-accent to-amber-600 hover:from-amber-500 hover:to-hotel-accent disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] flex items-center justify-center gap-2 border border-amber-500/50">
                  ยืนยันการทำรายการ <ArrowRight size={16} />
                </button>
              </div>
              <button onClick={() => setStatus('idle')} className="w-full text-xs text-slate-600 hover:text-slate-400 underline text-center">
                สแกน QR Code ใหม่
              </button>
            </motion.div>
          )}

          {/* PROCESSING */}
          {status === 'processing' && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-16 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full blur-xl bg-hotel-accent/30 animate-pulse" />
                <LoaderIcon className="w-16 h-16 text-hotel-accent animate-spin relative z-10" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-200">กำลังเชื่อมต่อตู้สาขา PBX...</p>
                <p className="text-sm text-slate-500 mt-1">สั่งการระบบไฟห้อง {selectedRoom}</p>
              </div>
            </motion.div>
          )}

          {/* SUCCESS */}
          {status === 'success' && (
            <motion.div key="success" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="py-10 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full blur-xl bg-emerald-500/30 animate-pulse" />
                <div className="bg-emerald-950/50 text-emerald-400 rounded-full p-5 border-2 border-emerald-500/50 relative z-10">
                  <CheckCircle2 size={64} className="animate-bounce" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-emerald-400 mb-2">ทำรายการสำเร็จ!</h3>
                <p className="text-sm text-slate-300 max-w-sm leading-relaxed mx-auto">
                  {flow === 'checkin'
                    ? `ระบบจ่ายไฟเข้าห้อง ${selectedRoom} เรียบร้อย กรุณาเสียบคีย์การ์ดเมื่อเข้าห้อง`
                    : `เช็คเอาท์ห้อง ${selectedRoom} สำเร็จ เดินทางปลอดภัยครับ`}
                </p>
              </div>
              <button onClick={handleReset}
                className="px-8 py-3 bg-slate-900 border border-slate-700 hover:border-slate-500 hover:text-white text-slate-300 rounded-xl text-sm font-bold transition-all">
                ทำรายการใหม่
              </button>
            </motion.div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <motion.div key="error" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="py-10 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full blur-xl bg-rose-500/30 animate-pulse" />
                <div className="bg-rose-950/50 text-rose-400 rounded-full p-5 border-2 border-rose-500/50 relative z-10"><XCircle size={64} /></div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-rose-400 mb-2">ทำรายการล้มเหลว</h3>
                <p className="text-sm text-slate-300 max-w-sm mx-auto bg-rose-950/30 p-3 rounded-lg border border-rose-900/50">
                  {errorMsg || 'เกิดข้อผิดพลาด กรุณาลองใหม่'}
                </p>
              </div>
              <button onClick={() => setStatus('scanned')}
                className="px-8 py-3 bg-hotel-accent/20 border border-hotel-accent/50 hover:bg-hotel-accent/40 text-hotel-accent rounded-xl text-sm font-bold transition-all">
                แก้ไขและลองใหม่
              </button>
              <button onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors">กลับหน้าเริ่มต้น</button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Debug Panel — แสดงทุก environment เพื่อ Troubleshoot ง่าย */}
      <div className="mt-4 p-3 bg-slate-950/80 border border-slate-800/50 rounded-xl text-[9px] text-slate-600 font-mono break-all leading-relaxed">
        <span className="text-slate-500">🔍 </span>{debugInfo}
      </div>
    </div>
  );
};

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export default Scan;
