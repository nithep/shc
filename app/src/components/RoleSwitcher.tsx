import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Shield, Users, UserCircle } from 'lucide-react';
import { useAuth, type UserRole } from '../context/AuthContext';

export default function RoleSwitcher() {
  const { role, setRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const roles: { id: UserRole; label: string; icon: any }[] = [
    { id: 'admin', label: 'Administrator', icon: Shield },
    { id: 'staff', label: 'Receptionist', icon: Users },
    { id: 'guest', label: 'Guest', icon: User },
  ];

  return (
    <div className="relative z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors"
      >
        <UserCircle className="text-hotel-accent" size={24} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden z-50"
            >
              <div className="p-3 border-b border-slate-800 bg-slate-950/50">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Switch Role (Demo)</p>
                <p className="text-sm font-medium text-white mt-1 capitalize">{role} View</p>
              </div>
              <div className="p-2">
                {roles.map((r) => {
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRole(r.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        role === r.id 
                          ? 'bg-hotel-accent/10 text-hotel-accent' 
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon size={16} />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
