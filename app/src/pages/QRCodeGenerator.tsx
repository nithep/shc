import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, MonitorSmartphone, CheckCircle2 } from 'lucide-react';

const QRCodeGenerator: React.FC = () => {
  const [roomNumber, setRoomNumber] = useState<string>('101');
  
  // อ่าน LIFF ID จาก Environment
  const liffId = import.meta.env.VITE_LIFF_ID || '2010634930-gRJCLqbu';
  // เปลี่ยนไปใช้ URL ของ LINE LIFF
  const scanUrl = `https://liff.line.me/${liffId}?room=${roomNumber}`;

  const availableRooms = ['101', '102', '103', '104', '105', '106'];

  const downloadQRCode = () => {
    const svg = document.getElementById('room-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `QR_Room_${roomNumber}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <MonitorSmartphone size={32} className="text-hotel-accent" />
        <h1 className="text-2xl font-bold text-white tracking-wide">ระบบจัดพิมพ์ QR Code ประจำห้องพัก</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-hotel-card rounded-xl p-5 sm:p-8 border border-white/5 flex flex-col items-center justify-center min-h-[380px] sm:min-h-[450px]">
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xl shadow-hotel-accent/10 mb-6 w-full max-w-[200px] sm:max-w-[250px] aspect-square flex items-center justify-center">
            <QRCodeSVG 
              id="room-qr-svg"
              value={scanUrl} 
              size={250} 
              className="w-full h-full"
              bgColor={"#ffffff"}
              fgColor={"#0f172a"}
              level={"H"}
              includeMargin={false}
            />
          </div>
          <p className="text-slate-400 mb-2 text-center text-xs sm:text-sm">สแกนเพื่อทดสอบ หรือดาวน์โหลดไฟล์เพื่อนำไปพิมพ์ติดหน้าประตู</p>
          <div className="flex items-center gap-2 text-hotel-accent bg-hotel-accent/10 px-4 py-2 rounded-lg font-mono text-[11px] sm:text-sm break-all mb-4 text-center justify-center">
            {scanUrl}
          </div>
          <button
            onClick={downloadQRCode}
            className="px-6 py-2.5 bg-hotel-accent text-slate-900 rounded-xl text-xs sm:text-sm font-semibold transition-all hover:bg-hotel-accent/80 active:scale-95 flex items-center gap-2 shadow-lg shadow-hotel-accent/20"
          >
            ดาวน์โหลดไฟล์ QR (SVG)
          </button>
        </div>

        <div className="bg-hotel-card rounded-xl p-5 sm:p-8 border border-white/5">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <QrCode className="text-hotel-accent" />
            ตั้งค่าหมายเลขห้อง
          </h2>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-400">
              เลือกหมายเลขห้องพักเพื่อสร้าง QR Code
            </label>
            <div className="grid grid-cols-3 gap-3">
              {availableRooms.map(room => (
                <button
                  key={room}
                  onClick={() => setRoomNumber(room)}
                  className={`py-3 px-4 rounded-lg font-medium transition-all duration-200 border flex items-center justify-center gap-2 ${
                    roomNumber === room
                      ? 'bg-hotel-accent text-slate-900 border-hotel-accent shadow-lg shadow-hotel-accent/20'
                      : 'bg-slate-800/50 text-white border-white/10 hover:border-hotel-accent/50 hover:bg-slate-800'
                  }`}
                >
                  {roomNumber === room && <CheckCircle2 size={16} />}
                  Room {room}
                </button>
              ))}
            </div>

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-200 leading-relaxed">
              <strong>ระบบบริการตนเอง (Self Check-in):</strong> แขกผู้เข้าพักสามารถสแกน QR Code นี้ผ่านสมาร์ทโฟนเพื่อเข้าสู่กระบวนการเช็คอินแบบดิจิทัล และเชื่อมต่อสั่งการระบบไฟฟ้าภายในห้องได้โดยตรงผ่านระบบอัตโนมัติ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeGenerator;
