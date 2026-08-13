import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type UserRole = 'admin' | 'staff' | 'guest' | 'owner' | 'front_desk';

interface AuthContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<UserRole>(() => {
    const savedRole = localStorage.getItem('user_role');
    if (savedRole === 'admin' || savedRole === 'staff' || savedRole === 'guest') {
      return savedRole as UserRole;
    }
    // Auto-map owner to admin for backwards compatibility
    if (savedRole === 'owner') return 'admin';
    
    return 'guest';
  });
  
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('auth_token');
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user_role', role);
    } else {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      // If token is removed, fallback to guest
      setRole('guest');
    }
  }, [token, role]);

  const logout = () => {
    setToken(null);
    setRole('guest');
    localStorage.clear();
    sessionStorage.clear();
    // Redirect to login page to prevent history traversal cache
    window.location.replace('/login');
  };

  return (
    <AuthContext.Provider value={{ role, setRole, token, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
