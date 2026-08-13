import { Link } from 'react-router-dom';
import { PlayCircle, ArrowRight } from 'lucide-react';

const Presentation = () => {
  return (
    <div className="relative w-full h-[85vh] bg-hotel-dark flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-slate-900 shadow-2xl group">
      
      {/* Video Placeholder Background */}
      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center opacity-20">
        <PlayCircle size={80} className="text-slate-800 mb-4 animate-pulse" />
        <p className="text-slate-700 font-mono text-sm">[ Cinematic AI Video Placeholder ]</p>
        <p className="text-slate-800 font-mono text-xs mt-2 text-center max-w-md">
          Scene 1: Lobby Arrival <br />
          Scene 2: QR Scan <br />
          Scene 3: Lights turning on
        </p>
      </div>
 
      {/* Overlay Content */}
      <div className="relative z-10 text-center space-y-8 max-w-2xl px-6">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-hotel-accent to-amber-600 drop-shadow-lg leading-tight">
          Smart Hotel Experience
        </h1>
        <p className="text-lg text-slate-400 font-light max-w-lg mx-auto">
          สัมผัสประสบการณ์การเข้าพักที่หรูหรา ไร้รอยต่อจากการเช็คอินดิจิทัลสู่ความสะดวกสบายทางกายภาพในห้องพักของคุณ
        </p>
 
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
          <Link
            to="scan"
            className="px-8 py-4 bg-gradient-to-r from-hotel-accent to-amber-600 hover:from-amber-500 hover:to-hotel-accent text-white rounded-full font-bold text-lg transition-all active:scale-95 shadow-xl shadow-amber-950/20 flex items-center gap-2"
          >
            เริ่มเช็คอินด้วยตนเอง <ArrowRight size={20} />
          </Link>
          <Link
            to="dashboard"
            className="px-8 py-4 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-full font-semibold text-lg transition-all active:scale-95 border border-slate-900"
          >
            แผงควบคุมหลัก (Dashboard)
          </Link>
        </div>
      </div>
 
      {/* Cinematic Bars */}
      <div className="absolute top-0 left-0 w-full h-10 bg-black/60 z-20"></div>
      <div className="absolute bottom-0 left-0 w-full h-10 bg-black/60 z-20"></div>

    </div>
  );
};

export default Presentation;
