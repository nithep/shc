import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, QrCode, Lightbulb, LightbulbOff, CheckCircle2, ChevronRight, Home, Smartphone, Zap, Loader2, AlertTriangle, Sparkles } from 'lucide-react';

// ─── API Base URL ────────────────────────────────────────────────────────────
// ค่าเริ่มต้นใช้ relative path (เมื่อ LIFF โฮสต์ร่วมกับ API เดียวกัน)
// หรือกำหนด VITE_API_URL = https://your-cloud-run-url/api สำหรับ Cloud Run แยกโดเมน
const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export default function CheckIn({ profile }) {
  const [step, setStep] = useState(1); // 1: Welcome, 2: Payment, 3: Checked In (Room Control)
  const [roomNumber, setRoomNumber] = useState('0101');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparingMsg, setPreparingMsg] = useState('กำลังเตรียมความพร้อมของห้องพัก...');
  const [powerState, setPowerState] = useState('unknown'); // 'on' | 'off' | 'unknown'
  const [controlError, setControlError] = useState('');
  const [flashOn, setFlashOn] = useState(false);

  const esRef = useRef(null);
  const pendingSessionRef = useRef(null);
  const pollTimerRef = useRef(null);
  const flashTimerRef = useRef(null);

  // ─── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // ─── SSE Real-time Stream ───────────────────────────────────────────────────
  const ensureStream = useCallback(() => {
    if (esRef.current) return esRef.current;

    const url = `${API_BASE_URL}/guest/stream?room=${encodeURIComponent(roomNumber)}`;
    const es = new EventSource(url);

    es.addEventListener('session', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSessionResolved(data.session);
      } catch (_) { /* ignore malformed frame */ }
    });

    es.addEventListener('state', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.state && data.state.power) {
          const p = String(data.state.power).toLowerCase();
          if (p === 'on') setPowerState('on');
          else if (p === 'off') setPowerState('off');
        }
      } catch (_) { /* ignore */ }
    });

    es.onerror = () => {
      // Browser จะ reconnect อัตโนมัติ; เรามี polling fallback อยู่แล้ว
    };

    esRef.current = es;
    return es;
  }, [roomNumber]);

  // ─── Session resolution (SSE + polling fallback) ────────────────────────────
  const handleSessionResolved = useCallback((session) => {
    if (!session || !pendingSessionRef.current) return;
    if (session.sessionId !== pendingSessionRef.current.id) return;

    const { onSuccess, onFailure } = pendingSessionRef.current;
    pendingSessionRef.current = null;
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }

    if (session.status === 'SUCCESS') {
      onSuccess(session);
    } else {
      onFailure(session);
    }
  }, []);

  const waitForSession = useCallback((sessionId, onSuccess, onFailure) => {
    pendingSessionRef.current = { id: sessionId, onSuccess, onFailure };
    ensureStream();

    // Fallback polling (เมื่อ browser ไม่รองรับ SSE หรือ Cloud Run ปิด streaming)
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/guest/session/${sessionId}`);
        const data = await res.json();
        if (data && data.session && data.session.status !== 'PENDING_RELAY') {
          handleSessionResolved(data.session);
          return;
        }
      } catch (_) { /* transient */ }
      pollTimerRef.current = setTimeout(poll, 2000);
    };
    pollTimerRef.current = setTimeout(poll, 2000);
  }, [ensureStream, handleSessionResolved]);

  // ─── Premium FX: flash + haptic ─────────────────────────────────────────────
  const triggerFlashAndHaptic = useCallback(() => {
    setFlashOn(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashOn(false), 1300);

    // Haptic feedback (Android / LINE in-app browser)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([25, 40, 25]); } catch (_) { /* not supported */ }
    }
  }, []);

  // ─── API helper ─────────────────────────────────────────────────────────────
  const apiRequest = async (path, body) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `API error (${res.status})`);
    }
    return data;
  };

  // ─── Check-in flow ──────────────────────────────────────────────────────────
  const handlePayment = async (method) => {
    setIsProcessing(true);
    setControlError('');
    try {
      const result = await apiRequest('/guest/checkin', {
        roomNumber,
        lineUserId: profile?.userId || '',
        guestName: profile?.displayName || 'Guest',
        transactionId: `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
        paymentMethod: method,
      });

      console.log('[CheckIn] ✅ accepted', result);

      setIsProcessing(false);
      setIsPreparing(true);
      setPreparingMsg('กำลังเตรียมความพร้อมของห้องพัก...');

      // รอผลยืนยันจาก Edge ผ่าน SSE (หรือ polling fallback)
      waitForSession(
        result.session_id,
        () => {
          setPowerState('on');
          setIsPreparing(false);
          triggerFlashAndHaptic();
          setStep(3);
        },
        (session) => {
          setIsPreparing(false);
          const msg = session.error || session.result?.error || 'ไม่สามารถเปิดไฟห้องได้ กรุณาลองใหม่';
          setControlError(msg);
        }
      );
    } catch (err) {
      console.error('[CheckIn] ❌', err);
      setIsProcessing(false);
      setControlError(err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  // ─── Smart Room Controls: เปิด/ปิดไฟแบบ Real-time ─────────────────────────
  const controlLights = async (action) => {
    setControlError('');
    setIsPreparing(true);
    setPreparingMsg(action === 'ON' ? 'กำลังเปิดไฟห้องพัก...' : 'กำลังปิดไฟห้องพัก...');
    try {
      const result = await apiRequest('/guest/control', {
        roomNumber,
        action, // 'ON' | 'OFF'
        lineUserId: profile?.userId || '',
      });

      console.log('[Control] ✅ accepted', result);

      waitForSession(
        result.session_id,
        () => {
          setPowerState(action === 'ON' ? 'on' : 'off');
          setIsPreparing(false);
          if (action === 'ON') triggerFlashAndHaptic();
        },
        (session) => {
          setIsPreparing(false);
          const msg = session.error || session.result?.error || 'ไม่สามารถควบคุมไฟได้';
          setControlError(msg);
        }
      );
    } catch (err) {
      console.error('[Control] ❌', err);
      setIsPreparing(false);
      setControlError(err.message || 'ไม่สามารถควบคุมไฟได้');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '2rem' }}>

      {/* ─── Power Flash Overlay (ไฟสว่างวาบสุดพรีเมียม) ─── */}
      <AnimatePresence>
        {flashOn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3, times: [0, 0.25, 1] }}
            className="power-flash"
          />
        )}
      </AnimatePresence>

      {/* ─── Preparing Overlay ─── */}
      <AnimatePresence>
        {isPreparing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="preparing-overlay"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}
            >
              <Zap size={52} color="#facc15" style={{ filter: 'drop-shadow(0 0 18px rgba(250,204,21,0.7))' }} />
              <Loader2 className="animate-spin" size={28} color="#8B5CF6" />
              <p style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, letterSpacing: '0.3px' }}>
                {preparingMsg}
              </p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                ระบบกำลังประสานงานกับตู้สาขาแบบเรียลไทม์
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}
      >
        <img
          src={profile?.pictureUrl}
          alt="Profile"
          style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--primary-color)', padding: '2px' }}
        />
        <div className="text-center">
          <h1 className="text-gradient" style={{ fontSize: '28px', marginBottom: '4px' }}>Smart Hotel</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{profile?.displayName}</strong></p>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* Step 1: Scan / Confirm Room */}
        {step === 1 && (
          <motion.div key="step1" variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--accent-color)' }}>
              <Home size={24} />
              <h3 style={{ margin: 0 }}>Confirm Check-in</h3>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Selected Room</p>
              <div style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '2px', color: 'var(--text-primary)' }}>
                {roomNumber}
              </div>
            </div>

            <button className="btn-primary" onClick={() => setStep(2)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              Proceed to Payment <ChevronRight size={20} />
            </button>
          </motion.div>
        )}

        {/* Step 2: Payment (IAP / PromptPay) */}
        {step === 2 && (
          <motion.div key="step2" variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', color: '#60a5fa' }}>
              <CreditCard size={24} />
              <h3 style={{ margin: 0 }}>Select Payment Method</h3>
            </div>

            {controlError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '12px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>
                <AlertTriangle size={16} />
                <span>{controlError}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary"
                style={{ background: '#00c300', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}
                onClick={() => handlePayment('linepay')}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Smartphone size={20} />}
                {isProcessing ? 'Processing...' : 'Pay with LINE Pay'}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary"
                style={{ background: '#1e3a8a', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}
                onClick={() => handlePayment('promptpay')}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <QrCode size={20} />}
                {isProcessing ? 'Processing...' : 'Thai QR PromptPay'}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Room Control */}
        {step === 3 && (
          <motion.div key="step3" variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', color: 'var(--accent-color)' }}>
              <CheckCircle2 size={28} />
              <h3 style={{ margin: 0 }}>Check-in Successful!</h3>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px',
              padding: '14px 16px', borderRadius: '12px',
              background: powerState === 'on' ? 'rgba(250,204,21,0.1)' : 'rgba(148,163,184,0.08)',
              border: `1px solid ${powerState === 'on' ? 'rgba(250,204,21,0.35)' : 'rgba(148,163,184,0.2)'}`,
            }}>
              {powerState === 'on' ? (
                <Lightbulb size={22} color="#facc15" style={{ filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.8))' }} />
              ) : (
                <LightbulbOff size={22} color="#94a3b8" />
              )}
              <div>
                <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
                  Room {roomNumber} — {powerState === 'on' ? 'Power ON' : powerState === 'off' ? 'Power OFF' : 'Syncing…'}
                </p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {powerState === 'on' ? 'ไฟฟ้าห้องพักจ่ายแล้ว สว่างวาบ ✨' : 'ควบคุมไฟได้ทันทีแบบเรียลไทม์'}
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Sparkles size={20} color="#facc15" />
                <h4 style={{ margin: 0 }}>Smart Room Controls</h4>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className="btn-primary"
                  style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
                  onClick={() => controlLights('ON')}
                >
                  <Lightbulb size={24} color="#facc15" />
                  <span style={{ fontSize: '14px' }}>Lights ON</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className="btn-primary"
                  style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
                  onClick={() => controlLights('OFF')}
                >
                  <LightbulbOff size={24} color="#94a3b8" />
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>Lights OFF</span>
                </motion.button>
              </div>
              {controlError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', padding: '12px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>
                  <AlertTriangle size={16} />
                  <span>{controlError}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
