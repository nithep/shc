// ==============================================================================
// ld2410_parser.h — HLK-LD2410C UART frame parser (PURE, host-testable)
//
// แยกตรรกะ parse ออกจาก Arduino/HardwareSerial เพื่อให้คอมไพล์ทดสอบบน PC ได้
// อ้างอิง: doc/raw/hardware_specs/hlk_ld2410c_uart_protocol_v1.07.md
//
//   Report frame  : F4 F3 F2 F1 | len(u16 LE) | data | F8 F7 F6 F5   (ไม่มี checksum)
//   Normal data   : len=0x000D (13) → frame รวม 23 ไบต์, data[0]=0x02, data[1]=0xAA,
//                   data[2]=state, data[3..4]=movingCm, data[5]=moveE,
//                   data[6..7]=staticCm, data[8]=staticE, data[9..10]=detectCm,
//                   data[11]=0x55, data[12]=0x00
//   Engineering   : len=0x0023 (35) → data[32]=OUT pin status
//
// หลักการ: incremental byte-feeder (รับทีละไบต์จาก UART) + ตรวจ header/length/footer
//          ทนขยะนำหน้า (resync) และกรอบแยกสองท่อน (stateful)
// ==============================================================================
#pragma once

#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace ld2410 {

// ─── ค่าคงที่โปรโตคอล ────────────────────────────────────────────────────────
static const uint8_t HDR[4]  = {0xF4, 0xF3, 0xF2, 0xF1};
static const uint8_t FTR[4]  = {0xF8, 0xF7, 0xF6, 0xF5};
static const uint8_t DATA_HEAD = 0xAA;   // data[1]
static const uint8_t TAIL      = 0x55;   // data[len-2]
static const uint8_t CHECK     = 0x00;   // data[len-1]

static const uint8_t TYPE_NORMAL = 0x02; // ข้อมูลเป้าหมายปกติ
static const uint8_t TYPE_ENGINE = 0x01; // โหมดวิศวกรรม (ห้ามใช้ในเฟิร์มแวร์จริง)

static const size_t LEN_NORMAL = 13;     // 0x000D
static const size_t LEN_ENGINE = 35;     // 0x0023
static const size_t MAX_DATA   = 64;     // เผื่อ buffer (ปกติสูงสุด 35)

// ─── สถานะเป้าหมาย (data[2]) ─────────────────────────────────────────────────
enum TargetState : uint8_t {
    ST_NONE         = 0x00,
    ST_MOVING       = 0x01,
    ST_STATIC       = 0x02,
    ST_MOVING_STATIC= 0x03,
    ST_NOISE_RUN    = 0x04,  // LD2410C V1.07
    ST_NOISE_OK     = 0x05,
    ST_NOISE_FAIL   = 0x06,
};

// ─── ผลการ parse ─────────────────────────────────────────────────────────────
struct Reading {
    bool        valid          = false;  // parse สำเร็จทั้งกรอบ
    bool        hasTarget      = false;  // moving || static
    uint8_t     state          = 0;      // TargetState
    uint16_t    movingDistanceCm = 0;
    uint8_t     movingEnergy   = 0;
    uint16_t    staticDistanceCm = 0;
    uint8_t     staticEnergy   = 0;
    uint16_t    detectDistanceCm = 0;
    bool        outPinActive   = false;  // เฉพาะโหมดวิศวกรรม (data[32]==0x01)
    bool        outPinKnown    = false;
};

// ─── parser แบบ incremental ──────────────────────────────────────────────────

class FrameParser {
public:
    // ป้อนทีละไบต์ (จาก UART); คืน true เมื่อได้กรอบสมบูรณ์ที่ valid
    // ผลลัพธ์เก็บไว้ที่ lastReading()
    bool feed(uint8_t b) {
        // 1) resync: หา header F4 F3 F2 F1 (ทนขยะนำหน้า)
        if (_hdrIdx < 4) {
            if (b == HDR[_hdrIdx]) {
                _hdrIdx++;
                if (_hdrIdx == 4) _reading = Reading{}; // เริ่มกรอบใหม่
            } else {
                // resync: ถ้าไบต์นี้เป็น F4 เริ่มนับใหม่ 1 ไม่งั้นรีเซ็ต
                _hdrIdx = (b == HDR[0]) ? 1 : 0;
            }
            return false;
        }

        // 2) อ่าน length (2 ไบต์ LE)
        if (_lenIdx < 2) {
            _lenBuf[_lenIdx++] = b;
            if (_lenIdx == 2) {
                _declaredLen = (uint16_t)_lenBuf[0] | ((uint16_t)_lenBuf[1] << 8);
                _dataIdx = 0;
                _failLen = (_declaredLen == 0 || _declaredLen > MAX_DATA);
            }
            return false;
        }
        if (_failLen) { reset(); return false; }

        // 3) อ่าน data ตามความยาวที่ประกาศ
        if (_dataIdx < _declaredLen) {
            _data[_dataIdx++] = b;
            // ไบต์นี้ถูกใช้เป็น data แล้ว ต้อง return เสมอ
            // (ห้าม fall-through ไปอ่าน footer ด้วยไบต์เดียวกัน)
            return false;
        }

        // 4) อ่าน footer 4 ไบต์
        if (_ftrIdx < 4) {
            if (b == FTR[_ftrIdx]) {
                _ftrIdx++;
                if (_ftrIdx == 4) {
                    bool ok = decode();
                    reset();
                    return ok;
                }
            } else {
                // footer ผิด → ทิ้งกรอบ, resync (ไบต์นี้อาจเป็น F4 ของกรอบใหม่)
                reset();
                if (b == HDR[0]) _hdrIdx = 1;
            }
        }
        return false;
    }

    const Reading& lastReading() const { return _reading; }

    void reset() {
        _hdrIdx = _lenIdx = _dataIdx = _ftrIdx = 0;
        _declaredLen = 0; _failLen = false;
    }

private:
    // ถอดข้อมูลในกรอบ → Reading; คืน true ถ้าถูกต้อง
    bool decode() {
        // internal markers: data[1]=0xAA, data[len-2]=0x55, data[len-1]=0x00
        if (_declaredLen < 3) return false;
        if (_data[1] != DATA_HEAD) return false;
        if (_data[_declaredLen - 2] != TAIL) return false;
        if (_data[_declaredLen - 1] != CHECK) return false;

        uint8_t type = _data[0];
        if (type == TYPE_NORMAL && _declaredLen == LEN_NORMAL) {
            Reading r;
            r.state            = _data[2];
            r.hasTarget        = (r.state == ST_MOVING || r.state == ST_STATIC || r.state == ST_MOVING_STATIC);
            r.movingDistanceCm = u16le(&_data[3]);
            r.movingEnergy     = _data[5];
            r.staticDistanceCm = u16le(&_data[6]);
            r.staticEnergy     = _data[8];
            r.detectDistanceCm = u16le(&_data[9]);
            r.valid            = true;
            r.outPinKnown      = false;
            _reading = r;
            return true;
        }
        if (type == TYPE_ENGINE && _declaredLen == LEN_ENGINE) {
            Reading r;
            r.state            = _data[2];
            r.hasTarget        = (r.state == ST_MOVING || r.state == ST_STATIC || r.state == ST_MOVING_STATIC);
            r.movingDistanceCm = u16le(&_data[3]);
            r.movingEnergy     = _data[5];
            r.staticDistanceCm = u16le(&_data[6]);
            r.staticEnergy     = _data[8];
            r.detectDistanceCm = u16le(&_data[9]);
            r.outPinActive     = (_data[32] == 0x01);
            r.outPinKnown      = true;
            r.valid            = true;
            _reading = r;
            return true;
        }
        // ชนิดข้อมูลอื่น / ความยาวไม่ตรง → drop (ไม่ crash)
        return false;
    }

    static uint16_t u16le(const uint8_t* p) {
        return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
    }

    uint8_t  _hdrIdx = 0;
    uint8_t  _lenIdx = 0;
    uint16_t _dataIdx = 0;
    uint8_t  _ftrIdx = 0;
    uint8_t  _lenBuf[2] = {0, 0};
    uint16_t _declaredLen = 0;
    bool     _failLen = false;
    uint8_t  _data[MAX_DATA] = {0};
    Reading  _reading;
};

} // namespace ld2410
