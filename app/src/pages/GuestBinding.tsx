import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, User, Calendar, LogIn, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

// LINE Theme Colors
const LINE_GREEN = '#00B900';
const LINE_BG = '#F5F5F5';

export default function GuestBinding() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || searchParams.get('binding_token');

  const [isLoading, setIsLoading] = useState(true);
  const [isBinding, setIsBinding] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const [bookingInfo, setBookingInfo] = useState<{
    roomNumber: string;
    guestName: string;
    checkinDate: string;
    checkoutDate: string;
    status: string;
  } | null>(null);

  // Mock LINE ID for now (In real app, this comes from LIFF SDK)
  const [mockLineId, setMockLineId] = useState(`U${Math.random().toString(36).substring(2, 10).toUpperCase()}`);

  useEffect(() => {
    if (!token) {
      setError('ไม่พบรหัสอ้างอิงการจอง (Invalid Link)');
      setIsLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await api.getBookingInfo(token);
        if (res.data.success) {
          setBookingInfo(res.data);
          if (res.data.status !== 'pending_binding') {
            setError('ลิงก์นี้ถูกใช้งานหรือหมดอายุไปแล้ว');
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.error || err.message || 'ไม่สามารถดึงข้อมูลการจองได้');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const handleBind = async () => {
    if (!token) return;
    setIsBinding(true);
    setError('');

    try {
      // In production, we would use LIFF SDK: liff.getProfile().then(p => p.userId)
      // Here we simulate the process
      const payload = {
        bindingToken: token,
        lineId: mockLineId,
      };

      const res = await api.bindBooking(payload);
      if (res.data.success) {
        setIsSuccess(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'เกิดข้อผิดพลาดในการยืนยันตัวตน');
    } finally {
      setIsBinding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: LINE_BG }}>
        <div className="w-8 h-8 border-4 border-[#00B900] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: LINE_BG }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-sm text-center max-w-sm w-full"
        >
          <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3.5 rounded-2xl font-bold text-white transition-opacity active:opacity-70"
            style={{ backgroundColor: LINE_GREEN }}
          >
            ลองใหม่อีกครั้ง
          </button>
        </motion.div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: LINE_BG }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl shadow-sm text-center max-w-sm w-full"
        >
          <div className="w-20 h-20 bg-green-50 text-[#00B900] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">เช็คอินสำเร็จ!</h2>
          <p className="text-slate-500 mb-6">คุณได้ยืนยันตัวตนเรียบร้อยแล้ว ระบบไฟในห้องพักของคุณพร้อมใช้งาน</p>
          
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100">
            <p className="text-sm text-slate-400 mb-1">หมายเลขห้อง</p>
            <p className="text-3xl font-extrabold text-[#00B900]">{bookingInfo?.roomNumber}</p>
          </div>

          <button 
            onClick={() => {
              // Should close LIFF here in real app: liff.closeWindow();
              alert("ปิดหน้าต่างนี้เพื่อกลับไปยังแชท LINE");
            }}
            className="w-full py-3.5 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            ปิดหน้านี้
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 font-sans" style={{ backgroundColor: LINE_BG }}>
      <div className="max-w-md w-full mx-auto mt-4 sm:mt-10">
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#00B900] text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm rotate-3">
            <CheckCircle2 size={32} className="-rotate-3" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">ยืนยันตัวตนเข้าพัก</h1>
          <p className="text-slate-500 text-sm mt-1">Smart Hotel Self Check-in</p>
        </div>

        {/* Info Card */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6 relative overflow-hidden"
        >
          {/* Decorative LINE color bar */}
          <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: LINE_GREEN }} />

          <h2 className="text-lg font-bold text-slate-800 mb-5 pb-4 border-b border-slate-100">รายละเอียดการจอง</h2>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
                <User size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">ชื่อผู้เข้าพัก</p>
                <p className="font-semibold text-slate-700">{bookingInfo?.guestName}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-[#00B900] flex-shrink-0">
                <span className="font-bold text-lg">{bookingInfo?.roomNumber}</span>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">หมายเลขห้อง</p>
                <p className="font-semibold text-[#00B900] text-lg leading-none mt-1">{bookingInfo?.roomNumber}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 pt-1">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">วันเช็คเอาท์</p>
                <p className="font-medium text-slate-600">
                  {bookingInfo?.checkoutDate ? new Date(bookingInfo.checkoutDate).toLocaleDateString('th-TH', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  }) : '-'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Button */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={handleBind}
            disabled={isBinding}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg shadow-[0_4px_15px_rgba(0,185,0,0.3)] transition-all active:scale-95 disabled:opacity-70 disabled:active:scale-100 flex justify-center items-center gap-2"
            style={{ backgroundColor: LINE_GREEN }}
          >
            {isBinding ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={22} />
                เข้าสู่ระบบด้วย LINE
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-400 mt-4">
            ระบบจะดึงข้อมูล LINE ID ของคุณเพื่อใช้เป็นกุญแจห้องพัก (Digital Key)
          </p>

          {/* Developer Tool: Change Mock LINE ID */}
          <div className="mt-8 pt-4 border-t border-slate-200">
            <p className="text-[10px] text-slate-400 text-center mb-2">🛠️ เครื่องมือนักพัฒนา (จำลอง LIFF SDK)</p>
            <div className="flex items-center gap-2 justify-center">
              <span className="text-xs text-slate-500 font-mono">ID: {mockLineId}</span>
              <button 
                onClick={() => setMockLineId(`U${Math.random().toString(36).substring(2, 10).toUpperCase()}`)}
                className="text-[10px] bg-slate-200 text-slate-600 px-2 py-1 rounded"
              >
                สุ่มใหม่
              </button>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
