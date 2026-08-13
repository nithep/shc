import { useState, useEffect } from 'react';
import { useAuth, type UserRole } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn, Lock, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';

const Login = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { role, setRole, token, setToken } = useAuth();
  const navigate = useNavigate();

  // Clear inputs and check for existing token on mount
  useEffect(() => {
    setPin('');
    if (token) {
      if (role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (role === 'staff') {
        navigate('/staff/dashboard', { replace: true });
      }
    }
  }, [token, role, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Calls backend verify-pin endpoint
      const response = await api.post('/auth/verify-pin', { pin });
      const { success, token, role } = response.data;

      if (success && token) {
        // Map backend roles -> frontend roles
        const mappedRole: UserRole =
          role === 'owner' ? 'admin' :
          role === 'front_desk' ? 'staff' : 'guest';

        setToken(token);
        setRole(mappedRole);

        // Redirect based on role
        if (mappedRole === 'admin') {
          navigate('/admin');
        } else {
          navigate('/staff/dashboard');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เข้าสู่ระบบล้มเหลว โปรดตรวจสอบรหัส PIN');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/10 mb-4">
              <LogIn className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">เข้าสู่ระบบ</h1>
            <p className="text-slate-400">ระบุรหัส PIN เพื่อเข้าถึงแผงควบคุมระบบ</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">รหัส PIN (Owner / Front Desk)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/50 border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl text-white placeholder-slate-500 transition-all outline-none"
                  placeholder="••••"
                  required
                />
              </div>
              {error && <p className="text-red-400 text-sm mt-2 ml-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400"></span>{error}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-purple-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  เข้าสู่ระบบ <CheckCircle2 className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-500 text-sm">
              © 2026 Hotel ECS System. Protected by PDPA.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
