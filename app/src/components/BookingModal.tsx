import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Copy } from 'lucide-react';
import { api } from '../lib/api';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  roomId: number;
}

export default function BookingModal({ isOpen, onClose, onSuccess, roomId }: BookingModalProps) {
  const [guestName, setGuestName] = useState('');
  const [nights, setNights] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [bindingData, setBindingData] = useState<{ token: string, url: string } | null>(null);

  const calculateCheckoutDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + nights);
    date.setHours(12, 0, 0, 0); // 12:00 PM checkout
    return date.toISOString();
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const payload = {
        roomId,
        guestName,
        checkinDate: new Date().toISOString(),
        checkoutDate: calculateCheckoutDate(),
      };
      
      // Need to add this endpoint to api.ts but we can use generic axios for now or assume it exists
      const response = await api.createBooking(payload);
      
      if (response.data.success) {
        // Fetch the binding link
        const bindRes = await api.getBindingLink(response.data.bookingId);
        if (bindRes.data.success) {
          setBindingData({
            token: bindRes.data.bindingToken,
            url: bindRes.data.bindingUrl
          });
          onSuccess();
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'เกิดข้อผิดพลาดในการสร้างการจอง');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (bindingData?.url) {
      navigator.clipboard.writeText(bindingData.url);
      alert('คัดลอกลิงก์สำเร็จ ส่งให้แขกทางแชทได้เลยครับ');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={!bindingData ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 w-full max-w-md overflow-hidden"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            {!bindingData ? (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-1">สร้างการจองห้องพัก</h2>
                  <p className="text-slate-400">สำหรับห้อง {roomId}</p>
                </div>

                <form onSubmit={handleCreateBooking} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">ชื่อผู้เข้าพัก</label>
                    <input
                      type="text"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                      placeholder="เช่น คุณสมชาย นามสมมติ"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">จำนวนคืน (Nights)</label>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => setNights(Math.max(1, nights - 1))} className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700">-</button>
                      <span className="text-xl font-bold text-white w-8 text-center">{nights}</span>
                      <button type="button" onClick={() => setNights(nights + 1)} className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700">+</button>
                    </div>
                  </div>

                  {error && <p className="text-rose-400 text-sm mt-2">{error}</p>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-purple-500/25 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? 'กำลังประมวลผล...' : 'สร้างการจอง และ ออกลิงก์'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">สร้างการจองสำเร็จ!</h3>
                <p className="text-slate-400 text-sm mb-6">คุณสามารถส่งลิงก์ด้านล่างนี้ให้แขกทางแชท เพื่อให้แขกผูกสิทธิ์เข้าพักด้วย LINE ID ของตัวเอง</p>
                
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl mb-6 flex items-center justify-between gap-3">
                  <div className="truncate text-slate-300 text-sm font-mono text-left">
                    {bindingData.url}
                  </div>
                  <button onClick={copyToClipboard} className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex-shrink-0 transition-colors">
                    <Copy size={18} />
                  </button>
                </div>

                <div className="flex gap-3 justify-center">
                  <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition-colors">
                    เสร็จสิ้น
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
