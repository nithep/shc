import axios, { type AxiosInstance, type AxiosError } from 'axios';

// API Base URL - ใช้ relative path เพื่อรองรับทั้ง local และ production (Cloudflare Tunnel)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create Axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor - Add auth token and PDPA consent header
apiClient.interceptors.request.use(
  (config) => {
    // Get JWT token from localStorage
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add PDPA consent version header for compliance tracking
    config.headers['X-PDPA-Version'] = '1.0';
    
    // Add request timestamp for audit trail
    config.headers['X-Request-Timestamp'] = new Date().toISOString();

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor - Handle errors globally
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    // Handle specific error codes
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Unauthorized - Token expired or invalid
          console.error('[API] Unauthorized - Redirecting to login');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_role');
          window.location.href = '/login';
          break;

        case 403:
          // Forbidden - Insufficient permissions
          console.error('[API] Forbidden - Insufficient permissions');
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงทรัพยากรนี้');

        case 429:
          // Rate Limited
          const rateData = data as any;
          const resetTime = rateData.resetAt ? new Date(rateData.resetAt) : null;
          throw new Error(
            `เกินขีดจำกัดการใช้งาน${resetTime ? ` กรุณารอจนถึง ${resetTime.toLocaleTimeString('th-TH')}` : ''}`
          );

        case 202:
          // Approval Required
          const approvalData = data as any;
          throw new Error(
            `คำสั่งต้องได้รับการอนุมัติ (${approvalData.reason || 'Approval Required'})`
          );

        case 500:
          // Server Error
          console.error('[API] Server Error:', data);
          throw new Error('เกิดข้อผิดพลาดบนเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');

        default:
          throw new Error((data as any)?.error || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('การเชื่อมต่อหมดเวลา กรุณาตรวจสอบเครือข่ายอินเทอร์เน็ต');
    } else if (error.message === 'Network Error') {
      throw new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อ');
    }

    return Promise.reject(error);
  }
);

// Auth helper functions
export const auth = {
  setToken: (token: string) => {
    localStorage.setItem('auth_token', token);
  },
  
  getToken: (): string | null => {
    return localStorage.getItem('auth_token');
  },
  
  removeToken: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
  },
  
  setRole: (role: string) => {
    localStorage.setItem('user_role', role);
  },
  
  getRole: (): string | null => {
    return localStorage.getItem('user_role');
  },
  
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('auth_token');
  },
};

// PDPA Consent helper
export const pdpa = {
  setConsentGiven: (consent: boolean) => {
    localStorage.setItem('pdpa_consent_given', String(consent));
    if (consent) {
      localStorage.setItem('pdpa_consent_timestamp', new Date().toISOString());
    }
  },
  
  hasConsent: (): boolean => {
    return localStorage.getItem('pdpa_consent_given') === 'true';
  },
  
  getConsentTimestamp: (): string | null => {
    return localStorage.getItem('pdpa_consent_timestamp');
  },
  
  clearConsent: () => {
    localStorage.removeItem('pdpa_consent_given');
    localStorage.removeItem('pdpa_consent_timestamp');
  },
};

// API endpoints
export const api = {
  // Health & Docs
  health: () => apiClient.get('/health'),
  docs: () => apiClient.get('/docs'),
  
  // Authentication
  verifyPin: (pin: string) => apiClient.post('/auth/verify-pin', { pin }),
  
  // Rooms
  getRooms: () => apiClient.get('/rooms'),
  getRoomStatus: (roomId: string) => apiClient.get(`/rooms/${roomId}/status`),
  extendStay: (roomId: string, days: number) => 
    apiClient.post(`/rooms/${roomId}/extend`, { days }),
  guestControl: (action: 'ON' | 'OFF') => 
    apiClient.post('/rooms/guest-control', { action }),
  forceControl: (roomNumber: string, action: 'ON' | 'OFF', source?: string) => 
    apiClient.post('/rooms/control', { roomNumber, action, source }),
  
  // Bookings
  getBookings: () => apiClient.get('/admin/bookings'),
  createBooking: (data: {
    roomId: number;
    guestName: string;
    checkinDate: string;
    checkoutDate: string;
  }) => apiClient.post('/admin/bookings', data),
  getBindingLink: (bookingId: number) => apiClient.get(`/admin/bookings/${bookingId}/binding`),
  cancelBooking: (bookingId: number) => apiClient.patch(`/admin/bookings/${bookingId}/cancel`),
  deleteBooking: (bookingId: number) => apiClient.delete(`/admin/bookings/${bookingId}`),
  getBookingInfo: (token: string) => apiClient.get(`/bookings/info?token=${token}`),
  bindBooking: (data: { bindingToken: string; lineId?: string; sessionId?: string }) =>
    apiClient.post('/bookings/bind', data),


  
  // Check-in/Check-out
  checkIn: (data: {
    roomNumber: string;
    guestName: string;
    guestEmail?: string;
    days?: number;
    dryRun?: boolean;
    pdpaConsent: {
      privacyPolicyAccepted: boolean;
      acceptedAt: string;
    };
  }) => apiClient.post('/checkin', data),
  
  checkOut: (roomNumber: string, dryRun?: boolean) => 
    apiClient.post('/checkout', { roomNumber, dryRun }),
  
  // PDPA
  getPrivacyPolicy: () => apiClient.get('/pdpa/privacy-policy'),
  submitConsent: (data: {
    guestName: string;
    guestEmail?: string;
    roomNumber: string;
    privacyPolicyAccepted: boolean;
    acceptedAt: string;
  }) => apiClient.post('/pdpa/consent', data),
  withdrawConsent: (consentHash: string, reason?: string) => 
    apiClient.post('/pdpa/withdraw', { consentHash, reason }),
  getConsentAudit: (params?: {
    room_number?: string;
    guest_name?: string;
    consent_hash?: string;
    limit?: number;
  }) => apiClient.get('/pdpa/audit', { params }),
  requestDataAccess: (params: { guestName?: string; roomNumber?: string }) => 
    apiClient.get('/pdpa/data-access', { params }),
  deletePersonalData: (data: {
    guestName?: string;
    roomNumber?: string;
    olderThanDays?: number;
  }) => apiClient.delete('/pdpa/data', { data }),
  
  // Admin
  getPendingApprovals: () => apiClient.get('/admin/approval'),
  getApprovalDetails: (id: string) => apiClient.get(`/admin/approval/${id}`),
  approveCommand: (id: string, reason: string, decidedBy?: string) => 
    apiClient.post(`/admin/approval/${id}/approve`, { reason, decidedBy }),
  rejectCommand: (id: string, reason: string, decidedBy?: string) => 
    apiClient.post(`/admin/approval/${id}/reject`, { reason, decidedBy }),
  executeApproved: (id: string) => 
    apiClient.post(`/admin/approval/${id}/execute`),
  
  // API Keys (Owner only)
  getApiKeys: () => apiClient.get('/admin/apikeys'),
  createApiKey: (name: string) => apiClient.post('/admin/apikeys', { name }),
  revokeApiKey: (id: string) => apiClient.delete(`/admin/apikeys/${id}`),
  
  // Audit Logs
  getAuditEvents: (params?: {
    trace_id?: string;
    event_type?: string;
    command_type?: string;
    limit?: number;
  }) => apiClient.get('/audit/events', { params }),
  clearAuditEvents: () => apiClient.delete('/audit/events'),
  
  // WiFi (Owner only)
  getWifiStatus: () => apiClient.get('/wifi/status'),
  scanWifi: () => apiClient.get('/wifi/scan'),
  connectWifi: (ssid: string, password?: string) => 
    apiClient.post('/wifi/connect', { ssid, password }),
  disconnectWifi: () => apiClient.post('/wifi/disconnect'),
  toggleWifi: (enabled: boolean) => apiClient.post('/wifi/toggle', { enabled }),
  
  // Diagnostics
  getDiagnostics: () => apiClient.get('/diagnostics/health'),
  copilotChat: (message: string, history?: Array<{role: string; content: string}>) => 
    apiClient.post('/diagnostics/copilot', { message, history }),
  
  // System
  getSystemReport: () => apiClient.get('/system/report'),
  
  // External API (for reference)
  externalCheckIn: (apiKey: string, data: any) => 
    apiClient.post('/v1/external/checkin', data, {
      headers: { 'X-API-Key': apiKey }
    }),
  externalCheckOut: (apiKey: string, data: any) => 
    apiClient.post('/v1/external/checkout', data, {
      headers: { 'X-API-Key': apiKey }
    }),
};

export default apiClient;
