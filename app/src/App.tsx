import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import AdminLayout from './components/AdminLayout';
import StaffLayout from './components/StaffLayout';
import Dashboard from './pages/Dashboard';
import Scan from './pages/Scan';
import Presentation from './pages/Presentation';
import GuestView from './pages/GuestView';
import WifiSettings from './pages/WifiSettings';
import QRCodeGenerator from './pages/QRCodeGenerator';
import Copilot from './pages/Copilot';
import CheckIn from './pages/CheckIn';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Unauthorized from './components/Unauthorized';
import GuestBinding from './pages/GuestBinding';
import Bookings from './pages/Bookings';

const ProtectedRoute = ({ allowedRoles, children }: { allowedRoles: string[], children: ReactNode }) => {
  const { role, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
};

// Simple Landing Page for testing
const LandingPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-center text-white p-8">
        <h1 className="text-4xl font-bold mb-4">Hotel ECS System</h1>
        <p className="text-xl mb-8">ระบบจัดการโรงแรมอัจฉริยะ</p>
        <div className="space-y-4">
          <a 
            href="/guest" 
            className="block bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
          >
            เข้าสู่ระบบแขก (Guest)
          </a>
          <a 
            href="/staff" 
            className="block bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
          >
            เข้าสู่ระบบเจ้าหน้าที่ (Staff)
          </a>
          <a 
            href="/admin" 
            className="block bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
          >
            เข้าสู่ระบบผู้ดูแล (Admin)
          </a>
        </div>
      </div>
    </div>
  );
};

import NurseDashboard from './pages/NurseDashboard';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<LandingPage />} />
          
          {/* Login Page */}
          <Route path="/login" element={<Login />} />

          {/* Guest Binding Page (No Auth Required) */}
          <Route path="/bind" element={<GuestBinding />} />

          {/* Nurse Call Station Dashboard (Public / Station Board) */}
          <Route path="/nursecall" element={<NurseDashboard />} />

          {/* Unauthorized Page */}
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Check-in Page (Public) */}
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/scan" element={<Scan />} />

          {/* Guest Role Route */}
          <Route path="/guest" element={<GuestView />} />

          {/* Staff Role Routes */}
          <Route path="/staff" element={
            <ProtectedRoute allowedRoles={['staff', 'admin']}>
              <StaffLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Presentation />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="scan" element={<Scan />} />
            <Route path="qr-generator" element={<QRCodeGenerator />} />
          </Route>

          {/* Admin Role Routes */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Presentation />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="scan" element={<CheckIn />} />
            <Route path="qr-generator" element={<QRCodeGenerator />} />
            <Route path="wifi" element={<WifiSettings />} />
            <Route path="copilot" element={<Copilot />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
