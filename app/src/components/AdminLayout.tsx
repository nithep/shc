import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, QrCode, Wifi, Bot, MonitorPlay, Printer, Settings,
  User, Globe, LogOut, ChevronDown, CalendarPlus
} from 'lucide-react';
import RoleSwitcher from './RoleSwitcher';
import { auth } from '../lib/api';
import { useState } from 'react';

const AdminLayout = () => {
  const location = useLocation();
  const basePath = '/admin';
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [language, setLanguage] = useState<'th' | 'en'>('th');

  const navItems = [
    { path: `${basePath}`, label: 'ภาพรวม', labelEn: 'Overview', icon: MonitorPlay },
    { path: `${basePath}/dashboard`, label: 'คอนโซล', labelEn: 'Console', icon: LayoutDashboard },
    { path: `${basePath}/bookings`, label: 'การจอง', labelEn: 'Bookings', icon: CalendarPlus },
    { path: `${basePath}/scan`, label: 'เช็คอิน', labelEn: 'Check-in', icon: QrCode },
    { path: `${basePath}/qr-generator`, label: 'สร้าง QR', labelEn: 'QR Generator', icon: Printer },
    { path: `${basePath}/wifi`, label: 'ตั้งค่าเครือข่าย', labelEn: 'Network Settings', icon: Wifi },
    { path: `${basePath}/copilot`, label: 'AI Copilot', icon: Bot },
  ];

  const handleLogout = () => {
    auth.removeToken();
    window.location.href = '/login';
  };

  const toggleLanguage = () => {
    const newLang = language === 'th' ? 'en' : 'th';
    setLanguage(newLang);
    localStorage.setItem('preferred_language', newLang);
    setShowLanguageMenu(false);
  };

  const getLabel = (item: typeof navItems[0]) => {
    return language === 'th' ? item.label : item.labelEn || item.label;
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Sidebar for Desktop - Glassmorphism */}
      <aside className="w-64 hidden md:flex flex-col border-r border-white/10 bg-slate-900/30 backdrop-blur-xl z-20 shadow-2xl">
        {/* Logo Section */}
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-500 flex items-center justify-center shadow-lg shadow-purple-500/20"
            >
              <span className="font-bold text-white text-xl">H</span>
            </motion.div>
            <div>
              <h1 className="font-bold text-white tracking-tight leading-tight text-lg">Hotel ECS</h1>
              <span className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold">Admin Workspace</span>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
            {language === 'th' ? 'การจัดการ' : 'Management'}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== basePath && location.pathname.startsWith(item.path));
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive 
                    ? 'text-white bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 shadow-lg shadow-purple-500/10' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="admin-sidebar-active"
                    className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl -z-10"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <Icon 
                  size={18} 
                  className={`transition-colors ${
                    isActive ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`} 
                />
                <span className="truncate">{getLabel(item)}</span>
              </Link>
            );
          })}
        </nav>
        
        {/* Bottom Section */}
        <div className="p-4 border-t border-white/10 space-y-2">
          {/* Language Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
            >
              <Globe size={18} />
              <span className="flex-1 text-left">{language === 'th' ? 'ภาษาไทย' : 'English'}</span>
              <ChevronDown size={14} className={`transition-transform ${showLanguageMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {showLanguageMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
              >
                <button
                  onClick={() => { setLanguage('th'); setShowLanguageMenu(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors ${language === 'th' ? 'text-purple-400 bg-purple-500/10' : 'text-slate-300'}`}
                >
                  🇹🇭 ภาษาไทย
                </button>
                <button
                  onClick={() => { setLanguage('en'); setShowLanguageMenu(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors ${language === 'en' ? 'text-purple-400 bg-purple-500/10' : 'text-slate-300'}`}
                >
                  🇺🇸 English
                </button>
              </motion.div>
            )}
          </div>

          {/* System Config */}
          <Link 
            to="#" 
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
          >
            <Settings size={18} />
            {language === 'th' ? 'ตั้งค่าระบบ' : 'System Config'}
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
          >
            <LogOut size={18} />
            {language === 'th' ? 'ออกจากระบบ' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-3/4 h-64 bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-1/2 h-64 bg-pink-500/5 blur-[120px] rounded-full pointer-events-none" />
        
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-white/10 bg-slate-900/20 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 md:hidden">
            <motion.div 
              whileTap={{ scale: 0.95 }}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg"
            >
              <span className="font-bold text-white text-lg">H</span>
            </motion.div>
            <span className="font-bold text-white tracking-tight">Admin</span>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-3">
            {/* User Profile */}
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white">
                  {auth.getRole() === 'admin' || auth.getRole() === 'owner' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'}
                </p>
                <p className="text-[10px] text-slate-400 capitalize">{auth.getRole()}</p>
              </div>
            </div>

            {/* Mobile Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="sm:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Globe size={20} />
            </button>
            
            {/* Role Switcher */}
            <RoleSwitcher />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 relative z-10">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto h-full"
          >
            <Outlet />
          </motion.div>
        </main>

        {/* Mobile Navigation - Glassmorphism */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 h-16 flex items-center justify-around px-2 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== basePath && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-medium transition-all duration-200 ${
                  isActive ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <motion.div 
                  whileTap={{ scale: 0.9 }}
                  className={`p-1.5 rounded-xl transition-all duration-200 ${
                    isActive ? 'bg-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/20' : 'text-slate-500'
                  }`}
                >
                  <Icon size={20} />
                </motion.div>
                <span className="mt-0.5 tracking-tight scale-90 truncate w-full text-center">
                  {getLabel(item)}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default AdminLayout;
