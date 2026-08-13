import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, QrCode, Printer, MonitorPlay } from 'lucide-react';
import RoleSwitcher from './RoleSwitcher';

const StaffLayout = () => {
  const location = useLocation();
  const basePath = '/staff';

  const navItems = [
    { path: `${basePath}`, label: 'Home', icon: MonitorPlay },
    { path: `${basePath}/dashboard`, label: 'Console', icon: LayoutDashboard },
    { path: `${basePath}/scan`, label: 'Check-in', icon: QrCode },
    { path: `${basePath}/qr-generator`, label: 'QR Gen', icon: Printer },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-hotel-dark">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-hotel-accent/10 blur-[100px] rounded-full pointer-events-none" />

      <header className="sticky top-0 z-50 border-b border-slate-800 bg-hotel-dark/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-hotel-accent to-amber-600 flex items-center justify-center shadow-lg shadow-hotel-accent/10">
                <span className="font-bold text-slate-950 text-lg">H</span>
              </div>
              <span className="font-semibold text-lg tracking-tight">Staff Portal</span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-2 mr-auto ml-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== basePath && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                      isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-pill-staff"
                        className="absolute inset-0 bg-slate-800 rounded-md -z-10"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            
            <div className="flex items-center gap-4">
              <RoleSwitcher />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 relative z-10">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-lg h-16 flex items-center justify-around px-2 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path !== basePath && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-medium transition-all ${
                isActive ? 'text-hotel-accent' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <div className={`p-1 rounded-xl transition-all duration-200 ${
                isActive ? 'bg-hotel-accent/10 text-hotel-accent' : 'text-slate-500'
              }`}>
                <Icon size={20} />
              </div>
              <span className="mt-0.5 tracking-tight scale-90">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default StaffLayout;
