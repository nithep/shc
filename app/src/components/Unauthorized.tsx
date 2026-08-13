import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-hotel-dark via-slate-900 to-hotel-dark flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-rose-500/30 shadow-[0_0_40px_rgba(225,29,72,0.15)] text-center relative overflow-hidden"
      >
        {/* Background glow */}
        <div className="absolute top-[-20%] right-[-20%] w-64 h-64 bg-rose-500/20 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <div className="w-20 h-20 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center ring-2 ring-rose-500/20 mb-6">
            <ShieldAlert className="w-10 h-10 text-rose-400" />
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">
            ปฏิเสธการเข้าถึง
          </h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงหน้านี้ กรุณากลับไปที่หน้าหลักหรือเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์
          </p>

          <div className="space-y-3">
            <button
              onClick={() => navigate(-1)}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไปหน้าก่อนหน้า
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-medium bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white transition-all shadow-lg shadow-rose-500/25"
            >
              เข้าสู่ระบบด้วยบัญชีอื่น
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
