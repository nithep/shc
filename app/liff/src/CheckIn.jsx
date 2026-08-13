import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, QrCode, Lightbulb, LightbulbOff, CheckCircle2, ChevronRight, Home, Smartphone, Zap, Loader2 } from 'lucide-react';

export default function CheckIn({ profile }) {
  const [step, setStep] = useState(1); // 1: Welcome, 2: Payment, 3: Checked In (Room Control)
  const [roomNumber, setRoomNumber] = useState('0101');
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async (method) => {
    setIsProcessing(true);
    // Mocking Payment Processing Delay
    setTimeout(async () => {
      try {
        // Here we would normally send Request to Cloud Run Backend
        // const response = await fetch('https://your-cloud-run-url/api/guest/checkin', {...});
        
        // Assume success for demo
        setIsProcessing(false);
        setStep(3);
      } catch (err) {
        console.error(err);
        setIsProcessing(false);
        alert('Failed to connect to backend.');
      }
    }, 2000);
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '2rem' }}>
      
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
          <p style={{ color: 'var(--text-secondary)' }}>Welcome back, <strong style={{color: 'var(--text-primary)'}}>{profile?.displayName}</strong></p>
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
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              The power in Room <strong style={{color: 'white'}}>{roomNumber}</strong> is now turned ON. Enjoy your stay!
            </p>
            
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Zap size={20} color="#facc15" />
                <h4 style={{ margin: 0 }}>Smart Room Controls</h4>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  className="btn-primary" 
                  style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
                >
                  <Lightbulb size={24} color="#facc15" />
                  <span style={{ fontSize: '14px' }}>Lights ON</span>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  className="btn-primary" 
                  style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
                >
                  <LightbulbOff size={24} color="#94a3b8" />
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>Lights OFF</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
