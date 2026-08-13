import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Bot, Send, RefreshCw, Server, ShieldAlert, CheckCircle, 
  Cpu, HardDrive, Wifi, Copy, Check, AlertTriangle 
} from 'lucide-react';

interface DiagnosticSection {
  status: 'green' | 'yellow' | 'red';
  details: string;
  [key: string]: any;
}

interface DiagnosticReport {
  timestamp: string;
  pbx: DiagnosticSection & { mode: string; state: string; isReady: boolean };
  network: DiagnosticSection & { ipAddress: string; dnsResolve: string; internet: string };
  database: DiagnosticSection & { path: string; sizeBytes: number };
  system: DiagnosticSection & { cpu: number; ram: number; uptime: number };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const Copilot: React.FC = () => {
  const navigate = useNavigate();
  
  // Role verification (Redirect if not owner)
  useEffect(() => {
    const role = localStorage.getItem('pms_role');
    const token = localStorage.getItem('pms_token');
    if (!token || role !== 'owner') {
      navigate('/dashboard');
    }
  }, [navigate]);

  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'สวัสดีครับ ยินดีต้อนรับสู่ **ECS System Copilot** 🤖\nผมพร้อมช่วยเหลือคุณในการตรวจสอบ ค้นหาสาเหตุ และให้คำสั่งแก้ไขปัญหาของระบบโรงแรมอัจฉริยะ\n\nกดปุ่ม **"เริ่มสแกนระบบ"** เพื่อวิเคราะห์สุขภาพเครื่อง Pi 4 หรือพิมพ์ถามปัญหาที่เกิดขึ้นได้ทันทีครับ!',
      timestamp: new Date().toLocaleTimeString('en-GB')
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const role = localStorage.getItem('pms_role');
    if (role === 'owner') {
      fetchDiagnostics();
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const fetchDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const response = await fetchWithAuth('/api/diagnostics/health');
      if (response.status === 401 || response.status === 403) {
        navigate('/dashboard');
        return;
      }
      const data = await response.json();
      if (data.success) {
        setReport(data.report);
      }
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || chatInput;
    if (!messageText.trim()) return;

    if (!textToSend) setChatInput('');

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toLocaleTimeString('en-GB')
    };

    setMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      // Map React messages history to backend payload
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetchWithAuth('/api/diagnostics/copilot', {
        method: 'POST',
        body: JSON.stringify({ message: messageText, history })
      });
      
      if (response.status === 401 || response.status === 403) {
        navigate('/dashboard');
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString('en-GB')
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        throw new Error(data.error || 'Server error');
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('en-GB')
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Helper function to render formatted response (markdown/bold/code blocks)
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('```')) {
        const code = part.replace(/```[a-zA-Z]*\n?|```$/g, '');
        const isCopied = copiedText === code;

        return (
          <div key={index} className="my-3 bg-[#0d1527] rounded-xl border border-slate-800 overflow-hidden font-mono text-[11px] sm:text-xs">
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#080d19] border-b border-slate-800 text-slate-400 text-[10px] tracking-wider uppercase">
              <span>Code / Terminal Command</span>
              <button 
                onClick={() => copyToClipboard(code)}
                className="flex items-center gap-1 hover:text-hotel-accent transition-colors"
              >
                {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-slate-300">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Format bold text (**text**) and bullet lists
      let renderedText = part.split('\n').map((line, lineIdx) => {
        // Match bold tags
        const boldParts = line.split(/(\*\*.*?\*\*)/g);
        const formattedLine = boldParts.map((bp, bIdx) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return <strong key={bIdx} className="text-hotel-accent font-semibold">{bp.substring(2, bp.length - 2)}</strong>;
          }
          return bp;
        });

        // Match list prefix
        if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
          return (
            <li key={lineIdx} className="ml-4 list-disc text-slate-300 my-0.5">
              {formattedLine.slice(1)}
            </li>
          );
        }

        return <p key={lineIdx} className="my-1 leading-relaxed">{formattedLine}</p>;
      });

      return <span key={index}>{renderedText}</span>;
    });
  };

  const getStatusIcon = (status: 'green' | 'yellow' | 'red') => {
    if (status === 'green') return <CheckCircle className="text-emerald-400" size={18} />;
    if (status === 'yellow') return <AlertTriangle className="text-amber-400" size={18} />;
    return <ShieldAlert className="text-red-500" size={18} />;
  };

  const getStatusColorClass = (status: 'green' | 'yellow' | 'red') => {
    if (status === 'green') return 'border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]';
    if (status === 'yellow') return 'border-amber-500/20 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.1)]';
    return 'border-red-500/20 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:h-[80vh]">
      {/* Diagnostics Panel (Left 5 Cols) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Server size={22} className="text-hotel-accent" />
              System Diagnostics
            </h1>
            <p className="text-xs text-slate-400">ตรวจสอบสุขภาพการทำงานของ Pi 4 และอุปกรณ์ IoT</p>
          </div>
          <button
            onClick={fetchDiagnostics}
            disabled={loadingDiagnostics}
            className="flex items-center gap-2 bg-hotel-city/10 hover:bg-hotel-city/20 text-hotel-city border border-hotel-city/20 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadingDiagnostics ? "animate-spin" : ""} />
            {loadingDiagnostics ? 'กำลังเช็ค...' : 'เริ่มสแกนระบบ'}
          </button>
        </div>

        {/* Diagnostics Grid */}
        <div className="space-y-4 overflow-y-auto lg:max-h-[70vh] pr-1">
          {report ? (
            <>
              {/* PBX status */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-5 rounded-2xl border transition-all ${getStatusColorClass(report.pbx.status)}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">ตู้สาขา PBX Connector</span>
                  {getStatusIcon(report.pbx.status)}
                </div>
                <div className="text-sm font-semibold text-slate-200 mb-1">
                  สถานะ: {report.pbx.state} ({report.pbx.mode} mode)
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{report.pbx.details}</p>
              </motion.div>

              {/* Network status */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`p-5 rounded-2xl border transition-all ${getStatusColorClass(report.network.status)}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">เครือข่าย & อินเทอร์เน็ต</span>
                  {getStatusIcon(report.network.status)}
                </div>
                <div className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                  <Wifi size={14} className="text-slate-400" />
                  IP: {report.network.ipAddress}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{report.network.details}</p>
              </motion.div>

              {/* Database status */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`p-5 rounded-2xl border transition-all ${getStatusColorClass(report.database.status)}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">ฐานข้อมูล SQLite</span>
                  {getStatusIcon(report.database.status)}
                </div>
                <div className="text-sm font-semibold text-slate-200 mb-1">
                  ขนาดไฟล์: {(report.database.sizeBytes / 1024).toFixed(1)} KB
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{report.database.details}</p>
              </motion.div>

              {/* System System metrics */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className={`p-5 rounded-2xl border transition-all ${getStatusColorClass(report.system.status)}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">ทรัพยากรระบบ (System Resource)</span>
                  {getStatusIcon(report.system.status)}
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span className="flex items-center gap-1"><Cpu size={12} /> CPU Usage</span>
                      <span>{report.system.cpu}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${report.system.cpu}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span className="flex items-center gap-1"><HardDrive size={12} /> RAM Usage</span>
                      <span>{report.system.ram}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-hotel-city" style={{ width: `${report.system.ram}%` }}></div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">{report.system.details}</p>
              </motion.div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              <RefreshCw className="mx-auto mb-3 animate-spin text-slate-600" size={24} />
              <p className="text-sm">กำลังรันการวินิจฉัยระบบกรุณารอสักครู่...</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Copilot Panel (Right 7 Cols) */}
      <div className="lg:col-span-7 flex flex-col h-[500px] lg:h-full bg-[#050a12] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl relative">
        {/* Header */}
        <div className="bg-[#080f1b] px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-hotel-accent/10 text-hotel-accent rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.2)]">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">ECS Copilot</h2>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                AI Assistant Online
              </span>
            </div>
          </div>
        </div>

        {/* Messages Chat Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 lg:max-h-[50vh]">
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-hotel-city text-slate-950 font-medium rounded-tr-none' 
                    : 'bg-[#0b1220] border border-slate-800/60 text-slate-200 rounded-tl-none shadow-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="space-y-1">
                    {renderMessageContent(msg.content)}
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
                <span className={`block text-[10px] mt-1.5 text-right ${msg.role === 'user' ? 'text-slate-900/60' : 'text-slate-500'}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-[#0b1220] border border-slate-800/60 rounded-2xl rounded-tl-none px-4 py-3 shadow-md flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin text-hotel-accent" />
                <span className="text-xs text-slate-400 font-mono">Copilot กำลังวิเคราะห์ข้อมูลและหาแนวทางแก้ไข...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggestion Chips */}
        <div className="px-6 py-2.5 bg-[#03060c] border-t border-slate-800/40 flex flex-wrap gap-2">
          <button 
            onClick={() => handleSendMessage('ตรวจสอบปัญหาระบบตู้สาขา PBX')}
            className="text-[11px] bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1 rounded-full transition-all"
          >
            🔍 เช็คตู้ PBX
          </button>
          <button 
            onClick={() => handleSendMessage('ขอคำสั่ง restart ตู้จำลอง PBX simulator')}
            className="text-[11px] bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1 rounded-full transition-all"
          >
            🔄 รีสตาร์ทตู้จำลอง
          </button>
          <button 
            onClick={() => handleSendMessage('วิธีแก้ไขโดเมน hotel.nithep.com ขึ้น 502 Bad Gateway')}
            className="text-[11px] bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1 rounded-full transition-all"
          >
            🌐 แก้ไขเว็บ 502
          </button>
          <button 
            onClick={() => handleSendMessage('เช็คสถานะการเข้าใช้งาน SSH')}
            className="text-[11px] bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1 rounded-full transition-all"
          >
            🔑 ปัญหา SSH
          </button>
        </div>

        {/* Input Form */}
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          className="p-4 bg-[#080f1b] border-t border-slate-800 flex gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={chatLoading}
            placeholder="พิมพ์ถามปัญหา หรือปรึกษาขั้นตอนแก้ไขระบบ..."
            className="flex-1 bg-[#040810] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-hotel-city/60 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            className="bg-hotel-city hover:bg-hotel-city-light text-slate-950 p-2.5 rounded-xl font-medium transition-all disabled:opacity-40 flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Copilot;
