import React, { useState } from 'react';
import { 
  Activity, AlertTriangle, PhoneCall, ShieldAlert, Heart, Clock, 
  CheckCircle2, Volume2, Wifi, Zap, UserCheck
} from 'lucide-react';

interface NurseCallEvent {
  id: string;
  room: string;
  bed: string;
  type: string;
  level: number;
  sla: number;
  timestamp: string;
  aiTag: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ESCALATED';
}

const NurseStationDashboard: React.FC = () => {
  const [events, setEvents] = useState<NurseCallEvent[]>([
    {
      id: 'EVT-0202-101',
      room: '0202',
      bed: 'BATH',
      type: 'BATHROOM_EMERGENCY',
      level: 2,
      sla: 60,
      timestamp: new Date(Date.now() - 25000).toISOString(),
      aiTag: 'HIGH_FALL_RISK_BATHROOM',
      status: 'PENDING'
    },
    {
      id: 'EVT-0305-102',
      room: '0305',
      bed: 'BED2',
      type: 'CARDIAC_CODE_BLUE',
      level: 3,
      sla: 30,
      timestamp: new Date(Date.now() - 10000).toISOString(),
      aiTag: 'CRITICAL_CODE_BLUE',
      status: 'PENDING'
    },
    {
      id: 'EVT-0101-100',
      room: '0101',
      bed: 'BED1',
      type: 'BEDSIDE_CALL',
      level: 1,
      sla: 180,
      timestamp: new Date(Date.now() - 45000).toISOString(),
      aiTag: 'NORMAL',
      status: 'ACKNOWLEDGED'
    }
  ]);

  const [activeTab, setActiveTab] = useState<'ALL' | 'CRITICAL' | 'RESOLVED'>('ALL');

  const handleAcknowledge = (id: string) => {
    setEvents(prev => prev.map(evt => evt.id === id ? { ...evt, status: 'ACKNOWLEDGED' } : evt));
  };

  const handleResolve = (id: string) => {
    setEvents(prev => prev.map(evt => evt.id === id ? { ...evt, status: 'RESOLVED' } : evt));
  };

  const handleTriggerEscalation = (id: string) => {
    setEvents(prev => prev.map(evt => evt.id === id ? { ...evt, status: 'ESCALATED' } : evt));
    alert(`🚨 สั่งการ PBX Voice Call Escalation! ตู้สาขากำลังโทรเข้ามือถือหัวหน้าเวรสำหรับเคส ${id}`);
  };

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 3:
        return <span className="px-3 py-1 bg-red-600/30 border border-red-500 text-red-400 font-bold rounded-full text-xs flex items-center gap-1 animate-pulse"><Heart className="w-3 h-3 text-red-400" /> LEVEL 3 - CODE BLUE (SLA 30s)</span>;
      case 2:
        return <span className="px-3 py-1 bg-amber-600/30 border border-amber-500 text-amber-400 font-bold rounded-full text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400" /> LEVEL 2 - BATHROOM (SLA 60s)</span>;
      case 1:
        return <span className="px-3 py-1 bg-blue-600/30 border border-blue-500 text-blue-400 font-bold rounded-full text-xs flex items-center gap-1"><Activity className="w-3 h-3 text-blue-400" /> LEVEL 1 - BEDSIDE (SLA 180s)</span>;
      default:
        return <span className="px-3 py-1 bg-gray-600/30 border border-gray-500 text-gray-400 font-bold rounded-full text-xs">LEVEL 0 - NORMAL</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 mb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-amber-300 to-blue-400">
                Nurse Station Emergency Dashboard
              </h1>
              <p className="text-xs text-slate-400">โรงพยาบาลราชเวช - Smart Nurse Call & Predictive Analytics System</p>
            </div>
          </div>
        </div>

        {/* Live System Status Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>PBX TCP LAN: CONNECTED (192.168.1.91)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-950/60 border border-blue-500/40 rounded-lg text-xs text-blue-300">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span>Cloud Sync: ACTIVE (GCP Pub/Sub)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-950/60 border border-purple-500/40 rounded-lg text-xs text-purple-300">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span>Vertex AI Engine: ONLINE</span>
          </div>
        </div>
      </header>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-red-500/40 shadow-lg shadow-red-950/20">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">ฉุกเฉินวิกฤต (Code Blue)</span>
            <Heart className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-extrabold text-red-400">
            {events.filter(e => e.level === 3 && e.status !== 'RESOLVED').length}
          </div>
          <span className="text-[11px] text-red-400/80">SLA 30 วินาที - ต้องเข้าถึงทันที</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/40 shadow-lg shadow-amber-950/20">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">ฉุกเฉินห้องน้ำ (Bathroom)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-400">
            {events.filter(e => e.level === 2 && e.status !== 'RESOLVED').length}
          </div>
          <span className="text-[11px] text-amber-400/80">SLA 60 วินาที - ความเสี่ยงผู้ป่วยหกล้มสูง</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-blue-500/40 shadow-lg shadow-blue-950/20">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">เรียกทั่วไปข้างเตียง (Bedside)</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-blue-400">
            {events.filter(e => e.level === 1 && e.status !== 'RESOLVED').length}
          </div>
          <span className="text-[11px] text-blue-400/80">SLA 180 วินาที - เรียกทั่วไป</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/40 shadow-lg shadow-emerald-950/20">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">เคสจัดการเสร็จสิ้น (Resolved)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">
            {events.filter(e => e.status === 'RESOLVED').length}
          </div>
          <span className="text-[11px] text-emerald-400/80">บันทึกลง Audit Log & BigQuery</span>
        </div>
      </div>

      {/* Emergency Active Board */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-red-400 animate-bounce" />
            รายการเรียกพยาบาลเรียลไทม์ (Live Nurse Call Stream)
          </h2>

          <div className="flex gap-2">
            {(['ALL', 'CRITICAL', 'RESOLVED'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === tab 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Event List */}
        <div className="space-y-4">
          {events
            .filter(e => {
              if (activeTab === 'CRITICAL') return e.level >= 2 && e.status !== 'RESOLVED';
              if (activeTab === 'RESOLVED') return e.status === 'RESOLVED';
              return true;
            })
            .map(evt => {
              const isCritical = evt.level >= 2;
              return (
                <div 
                  key={evt.id} 
                  className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                    evt.status === 'RESOLVED'
                      ? 'bg-slate-950/40 border-slate-800 opacity-60'
                      : isCritical 
                        ? 'bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border-red-500/50 shadow-lg shadow-red-950/30' 
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-2xl font-extrabold text-white tracking-wider">
                        ห้อง {evt.room} <span className="text-sm font-normal text-slate-400">({evt.bed})</span>
                      </span>
                      {getLevelBadge(evt.level)}

                      {evt.status === 'ESCALATED' && (
                        <span className="px-2.5 py-1 bg-purple-600/30 border border-purple-500 text-purple-300 font-bold rounded-full text-xs flex items-center gap-1">
                          <PhoneCall className="w-3 h-3 text-purple-400" /> PBX ESCALATED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" /> 
                        เวลา: {new Date(evt.timestamp).toLocaleTimeString('th-TH')}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]">
                        AI Tag: {evt.aiTag}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    {evt.status === 'PENDING' && (
                      <button 
                        onClick={() => handleAcknowledge(evt.id)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-colors"
                      >
                        <UserCheck className="w-4 h-4" /> กดรับเรื่อง (Acknowledge)
                      </button>
                    )}

                    {evt.status !== 'RESOLVED' && (
                      <>
                        <button 
                          onClick={() => handleTriggerEscalation(evt.id)}
                          className="px-3 py-2 bg-purple-900/60 hover:bg-purple-800 border border-purple-500/50 text-purple-200 font-medium rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                          title="ส่งคำสั่งสั่งตู้ PBX โทรออกหาหัวหน้าเวรอัตโนมัติ"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-purple-400" /> PBX Escalation
                        </button>

                        <button 
                          onClick={() => handleResolve(evt.id)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" /> เคลียร์เคส (Resolve)
                        </button>
                      </>
                    )}

                    {evt.status === 'RESOLVED' && (
                      <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> จัดการเรียบร้อย
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default NurseStationDashboard;
