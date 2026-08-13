import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Wifi, 
  WifiOff, 
  Lock, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Loader2, 
  Check, 
  AlertTriangle,
  HelpCircle
} from 'lucide-react';

interface WifiStatus {
  success: boolean;
  enabled: boolean;
  connected: boolean;
  ssid: string | null;
  bssid: string | null;
  signal: number | null;
  security: string | null;
}

interface WifiNetwork {
  active: boolean;
  ssid: string;
  bssid: string;
  signal: number;
  security: string;
}

const WifiSettings = () => {
  const navigate = useNavigate();
  
  // Role verification (Redirect if not owner)
  useEffect(() => {
    const role = localStorage.getItem('pms_role');
    const token = localStorage.getItem('pms_token');
    if (!token || role !== 'owner') {
      navigate('/dashboard');
    }
  }, [navigate]);

  const [status, setStatus] = useState<WifiStatus>({
    success: true,
    enabled: true,
    connected: false,
    ssid: null,
    bssid: null,
    signal: null,
    security: null
  });
  
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  
  // Connect Dialog state
  const [selectedNetwork, setSelectedNetwork] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Alert banner
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);

  // Helper for Authenticated Fetch
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('pms_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    return fetch(url, { ...options, headers });
  };

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/wifi/status');
      if (res.status === 401 || res.status === 403) {
        navigate('/dashboard');
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch wifi status', err);
      showAlert('error', 'ไม่สามารถเชื่อมต่อเพื่อดึงสถานะ Wi-Fi ได้');
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const scanNetworks = async (silent = false) => {
    if (!silent) setIsScanning(true);
    try {
      const res = await fetchWithAuth('/api/wifi/scan');
      if (res.status === 401 || res.status === 403) return;
      const data = await res.json();
      if (data.success) {
        setNetworks(data.networks || []);
      } else {
        showAlert('error', `ไม่สามารถสแกน Wi-Fi ได้: ${data.error || 'เกิดข้อผิดพลาด'}`);
      }
    } catch (err) {
      console.error('Failed to scan wifi', err);
      showAlert('error', 'ล้มเหลวในการส่งคำสั่งสแกน Wi-Fi');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    const role = localStorage.getItem('pms_role');
    if (role === 'owner') {
      fetchStatus();
      if (status.enabled) {
        scanNetworks(true);
      }
    }
  }, []);

  // Whenever wifi is enabled, fetch list
  useEffect(() => {
    if (status.enabled && !isLoadingStatus) {
      scanNetworks(true);
    } else {
      setNetworks([]);
    }
  }, [status.enabled]);

  const showAlert = (type: 'success' | 'error' | 'warning', text: string) => {
    setAlertMessage({ type, text });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  const handleToggleWifi = async () => {
    setIsToggling(true);
    const targetState = !status.enabled;
    try {
      const res = await fetchWithAuth('/api/wifi/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: targetState })
      });
      const data = await res.json();
      if (data.success) {
        setStatus(prev => ({
          ...prev,
          enabled: targetState,
          connected: targetState ? prev.connected : false,
          ssid: targetState ? prev.ssid : null
        }));
        showAlert('success', `ปิด/เปิดสัญญาณ Wi-Fi สำเร็จ`);
      } else {
        showAlert('error', 'ไม่สามารถเปลี่ยนสถานะ Wi-Fi ได้');
      }
    } catch (err) {
      showAlert('error', 'ล้มเหลวในการส่งคำสั่งปิด/เปิด Wi-Fi');
    } finally {
      setIsToggling(false);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm('คุณต้องการยกเลิกการเชื่อมต่อ Wi-Fi นี้ใช่หรือไม่?')) {
      setIsDisconnecting(true);
      try {
        const res = await fetchWithAuth('/api/wifi/disconnect', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showAlert('success', 'ยกเลิกการเชื่อมต่อสำเร็จ');
          fetchStatus();
          scanNetworks(true);
        } else {
          showAlert('error', `ตัดการเชื่อมต่อล้มเหลว: ${data.error}`);
        }
      } catch (err) {
        showAlert('error', 'ล้มเหลวในการส่งคำสั่งตัดการเชื่อมต่อ');
      } finally {
        setIsDisconnecting(false);
      }
    }
  };

  const handleConnect = async () => {
    if (!selectedNetwork) return;
    setIsConnecting(true);
    try {
      const res = await fetchWithAuth('/api/wifi/connect', {
        method: 'POST',
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          password: password || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `เชื่อมต่อกับ ${selectedNetwork.ssid} สำเร็จแล้ว`);
        setSelectedNetwork(null);
        setPassword('');
        fetchStatus();
        scanNetworks(true);
      } else {
        showAlert('error', `ไม่สามารถเชื่อมต่อได้: ${data.error || 'รหัสผ่านไม่ถูกต้อง หรือสัญญาณอ่อนเกินไป'}`);
      }
    } catch (err: any) {
      showAlert('error', `ล้มเหลวในการเชื่อมต่อ: ${err.message || 'เน็ตเวิร์กขัดข้อง'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const openConnectDialog = (net: WifiNetwork) => {
    // If it's already connected, ignore
    if (net.active && status.connected) return;
    
    setSelectedNetwork(net);
    setPassword('');
    setShowPassword(false);
  };

  // Helper to render signal strength bar indicator
  const renderSignalBars = (signal: number) => {
    const activeBars = Math.ceil(signal / 25); // 0 to 4 bars
    return (
      <div className="flex items-end gap-0.5 h-3.5 w-5">
        {[1, 2, 3, 4].map((bar) => (
          <div 
            key={bar} 
            className={`w-1 rounded-t-sm transition-all duration-300 ${
              bar <= activeBars 
                ? 'bg-hotel-accent shadow-[0_0_8px_rgba(212,175,55,0.6)]' 
                : 'bg-slate-700'
            }`}
            style={{ height: `${bar * 25}%` }}
          />
        ))}
      </div>
    );
  };

  if (isLoadingStatus) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
        <Loader2 className="animate-spin text-hotel-accent mb-4" size={40} />
        <p className="font-semibold">กำลังโหลดข้อมูลสถานะระบบเครือข่าย Wi-Fi...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-4xl mx-auto">
      {/* Alert Banner */}
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

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-hotel-accent to-slate-400 flex items-center gap-3">
            <Wifi className="text-hotel-accent" size={32} />
            จัดการระบบ Wi-Fi
          </h1>
          <p className="text-slate-400 mt-1">
            เชื่อมต่อเครือข่ายไร้สายเพื่อความยืดหยุ่นและการทำงานแบบ Failover สำเร็จรูป
          </p>
        </div>

        {/* Wifi Toggle Switch */}
        <div className="flex items-center gap-3 bg-slate-950/60 px-4 py-2.5 rounded-2xl border border-slate-900">
          <span className="text-sm font-semibold text-slate-400">สถานะ Wi-Fi:</span>
          <button
            onClick={handleToggleWifi}
            disabled={isToggling}
            className={`w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative outline-none border ${
              status.enabled 
                ? 'bg-hotel-accent/15 border-hotel-accent/30 shadow-[0_0_15px_rgba(212,175,55,0.2)]' 
                : 'bg-slate-900 border-slate-800'
            } ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <motion.div 
              layout
              className={`w-4.5 h-4.5 rounded-full ${
                status.enabled ? 'bg-hotel-accent' : 'bg-slate-500'
              }`}
              animate={{ x: status.enabled ? 20 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      </div>

      {/* Main Grid: Connected Status & Network List */}
      <div className="grid grid-cols-1 gap-6">
        {/* Connection status card */}
        <AnimatePresence mode="wait">
          {status.enabled ? (
            <motion.div
              key="connected-info"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className={`glass-panel rounded-2xl p-6 relative overflow-hidden border ${
                status.connected 
                  ? 'border-hotel-accent/40 shadow-[0_0_30px_rgba(212,175,55,0.08)]' 
                  : 'border-slate-800'
              }`}
            >
              {/* background accent blur */}
              <div className={`absolute -right-12 -top-12 w-32 h-32 rounded-full blur-3xl opacity-10 ${
                status.connected ? 'bg-hotel-accent' : 'bg-slate-600'
              }`} />

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl border ${
                    status.connected 
                      ? 'bg-hotel-accent/10 text-hotel-accent border-hotel-accent/20' 
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}>
                    {status.connected ? <Wifi size={32} /> : <WifiOff size={32} />}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                      สถานะเครือข่ายปัจจุบัน
                    </span>
                    <h3 className="text-xl font-bold text-slate-200 mt-0.5">
                      {status.connected ? status.ssid : 'ไม่ได้เชื่อมต่ออินเทอร์เน็ตไร้สาย'}
                    </h3>
                    {status.connected && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          BSSID: <span className="font-mono text-slate-300">{status.bssid || 'N/A'}</span>
                        </span>
                        <span className="h-1 w-1 bg-slate-600 rounded-full" />
                        <span className="flex items-center gap-1.5">
                          ระดับสัญญาณ: {renderSignalBars(status.signal || 0)} <span className="font-medium text-slate-300">({status.signal}%)</span>
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {status.connected && (
                  <button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="w-full md:w-auto bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        กำลังตัดการเชื่อมต่อ...
                      </>
                    ) : (
                      'ยกเลิกการเชื่อมต่อ'
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="disabled-info"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-hotel-card/60 border border-slate-900 rounded-2xl p-12 text-center text-slate-500 flex flex-col items-center justify-center"
            >
              <WifiOff className="text-slate-700 mb-3" size={48} />
              <h3 className="text-lg font-bold text-slate-400">ปิดการทำงานระบบ Wi-Fi</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                สัญญาณวิทยุอินเทอร์เฟซ Wi-Fi ปิดอยู่ คุณสามารถเปิด Wi-Fi ที่มุมบนขวาเพื่อสแกนและเชื่อมต่อเข้าสู่เครือข่ายไร้สายสำรองได้
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Network scanning list */}
        {status.enabled && (
          <div className="glass-panel border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                เครือข่าย Wi-Fi ที่พร้อมใช้งาน
                {networks.length > 0 && (
                  <span className="bg-slate-900 text-slate-400 text-xs px-2.5 py-1 rounded-md font-semibold border border-slate-800">
                    พบ {networks.length} รายการ
                  </span>
                )}
              </h2>
              
              <button
                onClick={() => scanNetworks()}
                disabled={isScanning}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 text-slate-300 hover:text-white px-4 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={isScanning ? 'animate-spin text-hotel-accent' : ''} />
                {isScanning ? 'กำลังสแกน...' : 'รีเฟรชเครือข่าย'}
              </button>
            </div>

            {/* List */}
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {networks.length === 0 ? (
                <div className="py-12 text-center text-slate-600 flex flex-col items-center">
                  {isScanning ? (
                    <>
                      <Loader2 className="animate-spin text-hotel-accent mb-3" size={32} />
                      <p className="text-sm">กำลังสแกนสัญญาณ Wi-Fi รอบตัว...</p>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="text-slate-700 mb-2" size={32} />
                      <p className="text-sm font-medium">ไม่พบเครือข่าย Wi-Fi ใดๆ ในพื้นที่</p>
                      <button 
                        onClick={() => scanNetworks()} 
                        className="text-xs text-hotel-accent underline mt-2 hover:text-amber-500 font-semibold"
                      >
                        ลองสแกนอีกครั้ง
                      </button>
                    </>
                  )}
                </div>
              ) : (
                networks.map((net) => {
                  const isConnectedNet = status.connected && status.ssid === net.ssid;
                  
                  return (
                    <div
                      key={net.bssid}
                      onClick={() => openConnectDialog(net)}
                      className={`group border rounded-xl p-4.5 transition-all duration-300 flex items-center justify-between gap-4 cursor-pointer relative overflow-hidden ${
                        isConnectedNet
                          ? 'bg-hotel-accent/5 border-hotel-accent/50 shadow-[0_0_20px_rgba(212,175,55,0.06)]'
                          : 'bg-slate-950/40 border-slate-900 hover:border-slate-800 hover:bg-slate-900/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 relative z-10">
                        <div className={`p-2.5 rounded-lg border ${
                          isConnectedNet 
                            ? 'bg-hotel-accent/10 text-hotel-accent border-hotel-accent/20' 
                            : 'bg-slate-900 text-slate-400 border-slate-900 group-hover:text-slate-200'
                        }`}>
                          <Wifi size={18} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200 text-sm sm:text-base flex items-center gap-2">
                            {net.ssid}
                            {isConnectedNet && (
                              <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 shadow-sm">
                                <Check size={8} /> เชื่อมต่ออยู่
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                            BSSID: {net.bssid}
                          </span>
                        </div>
                      </div>

                      {/* Right-aligned metadata */}
                      <div className="flex items-center gap-4 relative z-10">
                        {net.security && (
                          <div className="text-slate-500 flex items-center justify-center p-1" title={net.security}>
                            <Lock size={14} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {renderSignalBars(net.signal)}
                          <span className="text-xs text-slate-400 font-mono w-8 text-right">
                            {net.signal}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Password Overlay Modal */}
      <AnimatePresence>
        {selectedNetwork && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNetwork(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-hotel-card border border-slate-800 rounded-2xl w-full max-w-md p-6 relative z-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full blur-3xl opacity-10 bg-hotel-accent" />
              
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-2">
                <Lock className="text-hotel-accent" size={20} />
                เชื่อมต่อเครือข่าย Wi-Fi
              </h3>
              
              <p className="text-slate-400 text-sm mb-4">
                เครือข่าย: <span className="text-slate-200 font-bold">{selectedNetwork.ssid}</span>
                {selectedNetwork.security ? ` (${selectedNetwork.security})` : ' (เครือข่ายเปิด)'}
              </p>

              {/* Input logic */}
              {selectedNetwork.security ? (
                <div className="space-y-1.5 mb-5">
                  <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                    รหัสผ่าน Wi-Fi (WPA key)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="ป้อนรหัสผ่าน..."
                      disabled={isConnecting}
                      className="w-full bg-slate-950 border border-slate-900 focus:border-hotel-accent focus:ring-1 focus:ring-hotel-accent rounded-xl py-3 pl-4 pr-11 text-slate-200 text-sm outline-none resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-900 p-4.5 rounded-xl text-xs text-slate-400 mb-5 flex gap-2">
                  <HelpCircle className="text-hotel-accent shrink-0" size={16} />
                  <span>เครือข่ายนี้ไม่ต้องใช้รหัสผ่านในการเชื่อมต่อ คุณสามารถกดปุ่มเชื่อมต่อเพื่อเข้าใช้งานได้ทันที</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSelectedNetwork(null)}
                  disabled={isConnecting}
                  className="bg-slate-950 text-slate-400 border border-slate-900 hover:bg-slate-900 hover:text-white px-4.5 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="bg-hotel-accent text-slate-950 hover:bg-amber-500 shadow-lg shadow-hotel-accent/15 px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      กำลังเชื่อมต่อ...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      เชื่อมต่อเครือข่าย
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WifiSettings;
