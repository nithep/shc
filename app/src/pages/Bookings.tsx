import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CalendarPlus, Copy, RefreshCw, XCircle, Trash2, 
  CheckCircle2, Clock, Link2, AlertCircle, Search,
  ChevronDown, ExternalLink
} from 'lucide-react';
import { api } from '../lib/api';

interface Booking {
  id: number;
  room_id: number;
  guest_name: string;
  status: string;
  binding_token: string;
  guest_line_id: string | null;
  guest_session_id: string | null;
  checkin_date: string;
  checkout_date: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending_binding: { label: 'รอผูกสิทธิ์', color: 'amber', icon: Clock },
  bound: { label: 'ผูกสิทธิ์แล้ว', color: 'emerald', icon: CheckCircle2 },
  cancelled: { label: 'ยกเลิกแล้ว', color: 'red', icon: XCircle },
};

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending_binding' | 'bound' | 'cancelled'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [bindingUrls, setBindingUrls] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // --- New Booking Form ---
  const [showNewForm, setShowNewForm] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newNights, setNewNights] = useState(1);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [rooms, setRooms] = useState<Array<{id: number; status: string}>>([]);

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getBookings();
      const bookingsList = res.data?.bookings || (Array.isArray(res.data) ? res.data : []);
      setBookings(Array.isArray(bookingsList) ? bookingsList : []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดข้อมูลการจองได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await api.getRooms();
      const roomsList = res.data?.rooms || (Array.isArray(res.data) ? res.data : []);
      setRooms(Array.isArray(roomsList) ? roomsList : []);
    } catch {
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchRooms();
  }, [fetchBookings, fetchRooms]);

  const safeBookings = Array.isArray(bookings) ? bookings : [];

  const filteredBookings = safeBookings.filter(b => {
    if (!b) return false;
    const matchFilter = filter === 'all' || b.status === filter;
    const guestName = b.guest_name || '';
    const matchSearch = !searchTerm || 
      guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(b.room_id || '').includes(searchTerm);
    return matchFilter && matchSearch;
  });

  const handleGetLink = async (bookingId: number) => {
    try {
      const res = await api.getBindingLink(bookingId);
      if (res.data.success) {
        setBindingUrls(prev => ({ ...prev, [bookingId]: res.data.bindingUrl }));
      }
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถดึงลิงก์ได้');
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('คัดลอกลิงก์สำเร็จ!');
  };

  const handleCancel = async (bookingId: number) => {
    if (!confirm('ยืนยันยกเลิกการจองนี้?')) return;
    setActionLoading(bookingId);
    try {
      await api.cancelBooking(bookingId);
      await fetchBookings();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถยกเลิกได้');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (bookingId: number) => {
    if (!confirm('ยืนยันลบการจองนี้? (ลบถาวร)')) return;
    setActionLoading(bookingId);
    try {
      await api.deleteBooking(bookingId);
      await fetchBookings();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบได้');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomId || !newGuestName) return;
    setFormLoading(true);
    setFormError('');
    setFormSuccess('');
    try {
      const checkinDate = new Date().toISOString();
      const checkoutDate = new Date(Date.now() + newNights * 86400000);
      checkoutDate.setHours(12, 0, 0, 0);

      const res = await api.createBooking({
        roomId: Number(newRoomId),
        guestName: newGuestName,
        checkinDate,
        checkoutDate: checkoutDate.toISOString(),
      });

      if (res.data.success) {
        // Get binding link
        const linkRes = await api.getBindingLink(res.data.bookingId);
        const url = linkRes.data.bindingUrl || '';
        setFormSuccess(`สร้างการจองสำเร็จ! ลิงก์: ${url}`);
        setBindingUrls(prev => ({ ...prev, [res.data.bookingId]: url }));
        setNewGuestName('');
        setNewRoomId('');
        setNewNights(1);
        await fetchBookings();
      }
    } catch (err: any) {
      setFormError(err.response?.data?.error || err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setFormLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', {
        day: 'numeric', month: 'short', year: '2-digit',
      });
    } catch { return dateStr; }
  };

  const counts = {
    all: safeBookings.length,
    pending_binding: safeBookings.filter(b => b?.status === 'pending_binding').length,
    bound: safeBookings.filter(b => b?.status === 'bound').length,
    cancelled: safeBookings.filter(b => b?.status === 'cancelled').length,
  };

  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const vacantRooms = safeRooms.filter(r => r?.status === 'vacant');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">การจองห้องพัก</h1>
          <p className="text-slate-400 text-sm mt-1">จัดการการจอง สร้างลิงก์เช็คอิน และติดตามสถานะ</p>
        </div>
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fetchBookings()}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium flex items-center gap-2 transition-colors border border-slate-700"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            รีเฟรช
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-purple-500/25 transition-all"
          >
            <CalendarPlus size={16} />
            สร้างการจองใหม่
          </motion.button>
        </div>
      </div>

      {/* New Booking Form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-900/80 border border-purple-500/30 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <CalendarPlus size={20} className="text-purple-400" />
                สร้างการจองใหม่
              </h3>
              <form onSubmit={handleCreateBooking} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">ห้องพัก</label>
                  <select
                    value={newRoomId}
                    onChange={e => setNewRoomId(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                  >
                    <option value="">เลือกห้อง...</option>
                    {vacantRooms.length > 0 ? (
                      vacantRooms.map(r => (
                        <option key={r.id} value={r.id}>ห้อง {r.id} (ว่าง)</option>
                      ))
                    ) : (
                      rooms.map(r => (
                        <option key={r.id} value={r.id}>ห้อง {r.id} ({r.status === 'vacant' ? 'ว่าง' : 'มีผู้เข้าพัก'})</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">ชื่อผู้เข้าพัก</label>
                  <input
                    type="text"
                    required
                    value={newGuestName}
                    onChange={e => setNewGuestName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 rounded-xl text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
                    placeholder="ชื่อ-นามสกุล"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">จำนวนคืน</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setNewNights(Math.max(1, newNights - 1))} className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700">-</button>
                    <span className="text-xl font-bold text-white w-8 text-center">{newNights}</span>
                    <button type="button" onClick={() => setNewNights(newNights + 1)} className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700">+</button>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {formLoading ? <RefreshCw size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
                    {formLoading ? 'กำลังสร้าง...' : 'สร้างการจอง'}
                  </button>
                </div>
              </form>
              {formError && <p className="text-rose-400 text-sm mt-3">{formError}</p>}
              {formSuccess && (
                <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 size={16} /> {formSuccess}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending_binding', 'bound', 'cancelled'] as const).map(f => {
          const labels: Record<string, string> = { all: 'ทั้งหมด', pending_binding: 'รอผูกสิทธิ์', bound: 'ผูกแล้ว', cancelled: 'ยกเลิก' };
          const colors: Record<string, string> = { all: 'slate', pending_binding: 'amber', bound: 'emerald', cancelled: 'red' };
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                isActive
                  ? `bg-${colors[f]}-500/20 text-${colors[f]}-400 border-${colors[f]}-500/40`
                  : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
              style={isActive ? {
                backgroundColor: f === 'all' ? 'rgba(100,116,139,0.2)' : f === 'pending_binding' ? 'rgba(245,158,11,0.2)' : f === 'bound' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                color: f === 'all' ? '#94a3b8' : f === 'pending_binding' ? '#fbbf24' : f === 'bound' ? '#34d399' : '#f87171',
                borderColor: f === 'all' ? 'rgba(100,116,139,0.4)' : f === 'pending_binding' ? 'rgba(245,158,11,0.4)' : f === 'bound' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)',
              } : {}}
            >
              {labels[f]} ({counts[f]})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="ค้นหาชื่อแขกหรือหมายเลขห้อง..."
          className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 flex items-center gap-2">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Bookings List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw size={32} className="animate-spin text-purple-400" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CalendarPlus size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">ไม่พบการจอง</p>
          <p className="text-sm mt-1">กดปุ่ม "สร้างการจองใหม่" เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBookings.map((booking, index) => {
            const config = statusConfig[booking.status] || statusConfig.pending_binding;
            const StatusIcon = config.icon;
            const isExpanded = expandedId === booking.id;
            const bindingUrl = bindingUrls[booking.id];

            return (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm hover:border-slate-700 transition-all"
              >
                {/* Main Row */}
                <div
                  className="p-4 sm:p-5 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Room Badge */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-purple-400 font-semibold uppercase">ห้อง</span>
                      <span className="text-lg font-bold text-white leading-tight">{booking.room_id}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold truncate">{booking.guest_name}</h3>
                      <div className="flex items-center gap-3 text-sm text-slate-400 mt-0.5">
                        <span>{formatDate(booking.checkin_date)} - {formatDate(booking.checkout_date)}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div 
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                      style={{
                        backgroundColor: config.color === 'amber' ? 'rgba(245,158,11,0.15)' : config.color === 'emerald' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: config.color === 'amber' ? '#fbbf24' : config.color === 'emerald' ? '#34d399' : '#f87171',
                      }}
                    >
                      <StatusIcon size={14} />
                      {config.label}
                    </div>

                    <ChevronDown size={18} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-0 border-t border-slate-800/50">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-sm">
                          <div>
                            <span className="text-slate-500 text-xs">รหัสการจอง</span>
                            <p className="text-white font-mono">#{booking.id}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 text-xs">สร้างเมื่อ</span>
                            <p className="text-white">{formatDate(booking.created_at)}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 text-xs">LINE ID</span>
                            <p className="text-white">{booking.guest_line_id || '-'}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 text-xs">Session ID</span>
                            <p className="text-white font-mono truncate">{booking.guest_session_id || '-'}</p>
                          </div>
                        </div>

                        {/* Binding URL */}
                        {booking.status === 'pending_binding' && (
                          <div className="mt-4">
                            {bindingUrl ? (
                              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center gap-3">
                                <ExternalLink size={16} className="text-purple-400 flex-shrink-0" />
                                <span className="text-sm text-slate-300 font-mono truncate flex-1">{bindingUrl}</span>
                                <button onClick={() => handleCopy(bindingUrl)} className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white flex-shrink-0">
                                  <Copy size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleGetLink(booking.id)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                              >
                                <Link2 size={14} /> ดึงลิงก์ส่งให้แขก
                              </button>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="mt-4 flex gap-3">
                          {booking.status === 'pending_binding' && (
                            <button
                              onClick={() => handleCancel(booking.id)}
                              disabled={actionLoading === booking.id}
                              className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                              <XCircle size={14} /> ยกเลิกการจอง
                            </button>
                          )}
                          {(booking.status === 'cancelled' || booking.status === 'pending_binding') && (
                            <button
                              onClick={() => handleDelete(booking.id)}
                              disabled={actionLoading === booking.id}
                              className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-600/30 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                              <Trash2 size={14} /> ลบถาวร
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
