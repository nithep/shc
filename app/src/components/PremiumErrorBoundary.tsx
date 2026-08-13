import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * PremiumErrorBoundary - เกราะป้องกันจอมืดสำหรับ Hotel ECS Frontend
 * 
 * ดักจับข้อผิดพลาดระดับ Component Tree และแสดง UI แบบพรีเมียมแทนหน้าจอมืด
 * ใช้สไตล์ Dark Mode โฉบเฉี่ยวพร้อม Glassmorphism effects และ Micro-animations
 */
class PremiumErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  /**
   * ดักจับ errors ที่เกิดขึ้นใน component tree ด้านล่าง
   */
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  /**
   * จับข้อมูลเพิ่มเติมเกี่ยวกับ error (เช่น stack trace)
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[PREMIUM ERROR BOUNDARY] Caught unhandled error:', error);
    console.error('[PREMIUM ERROR BOUNDARY] Error Info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  /**
   * รีโหลดหน้าเว็บเพื่อกู้คืนระบบ
   */
  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          {/* Glassmorphism Error Panel */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full p-8 animate-in fade-in zoom-in duration-500">
            
            {/* Error Icon with Pulse Animation */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl animate-pulse"></div>
                <svg
                  className="w-20 h-20 text-red-400 relative z-10 animate-pulse"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Error Title */}
            <h1 className="text-3xl font-bold text-center text-white mb-4 font-['Plus_Jakarta_Sans']">
              ระบบขัดข้องชั่วคราว
            </h1>

            {/* Error Message */}
            <p className="text-gray-300 text-center mb-6 font-['Outfit']">
              ขออภัย เกิดข้อผิดพลาดที่ไม่คาดคิดในระบบ โปรดกดปุ่มด้านล่างเพื่อรีโหลดหน้าจอ
            </p>

            {/* Technical Details (Collapsible) */}
            {import.meta.env.MODE === 'development' && this.state.error && (
              <details className="mb-6 bg-black/30 rounded-lg p-4 border border-white/5">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                  รายละเอียดทางเทคนิค (คลิกเพื่อดู)
                </summary>
                <pre className="mt-3 text-xs text-red-300 overflow-x-auto whitespace-pre-wrap font-mono">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            {/* Reload Button with Premium Styling */}
            <button
              onClick={this.handleReload}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-purple-500/25 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                รีโหลดหน้าจอ (Reload Interface)
              </span>
              {/* Shimmer Effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </button>

            {/* Support Contact */}
            <p className="text-center text-gray-500 text-sm mt-6 font-['Outfit']">
              หากปัญหายังคงอยู่ กรุณาติดต่อทีม技术支持
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PremiumErrorBoundary;
