// ==============================================================================
// presence_sensor.h — อ่าน HLK-LD2410C (24GHz mmWave) ผ่าน UART2 ของ ESP32
//
// ตรรกะ parse อยู่ใน ld2410_parser.h (pure, host-testable)
// สเปก: doc/raw/hardware_specs/hlk_ld2410c_uart_protocol_v1.07.md
//
//   UART2: RX=GPIO16 (จาก Tx โมดูล), TX=GPIO17 (ไป Rx โมดูล) — 256000 8N1
//
//   การแมปผล → event:
//     - moving/static/ทั้งคู่ → hasTarget=true
//     - persons: LD2410C ไม่รายงานจำนวนคนตรงๆ → ประมาณ 1 เมื่อมีเป้า (ดูหมายเหตุ)
//     - confidence: ประมาณจากพลังงาน (energy/100)
// ==============================================================================
#pragma once

#include <Arduino.h>
#include <HardwareSerial.h>

#include "ld2410_parser.h"

#ifndef LD2410C_BAUD
#define LD2410C_BAUD 256000
#endif

#ifndef LD2410_RX_PIN
#define LD2410_RX_PIN 16
#endif
#ifndef LD2410_TX_PIN
#define LD2410_TX_PIN 17
#endif

struct PresenceReading {
    bool  hasTarget  = false;
    int   persons    = 0;
    float confidence = 0.0f;   // 0.0–1.0
};

class PresenceSensor {
public:
    void begin() {
        // 256000 8N1 — ค่าเริ่มต้นโรงงาน ห้ามเปลี่ยน baud ของโมดูล
        _serial.begin(LD2410C_BAUD, SERIAL_8N1, LD2410_RX_PIN, LD2410_TX_PIN);
    }

    // อ่าน byte ที่ค้างใน UART แล้วป้อนเข้า parser; คืน reading ปัจจุบัน (non-blocking)
    PresenceReading read() {
        while (_serial.available() > 0) {
            if (_parser.feed((uint8_t)_serial.read())) {
                _apply(_parser.lastReading());
            }
        }
        return _last;
    }

    PresenceReading last() const { return _last; }

private:
    void _apply(const ld2410::Reading& r) {
        if (!r.valid) return;
        PresenceReading out;
        out.hasTarget = r.hasTarget;
        // LD2410C ไม่นับจำนวนคน — ประมาณ 1 เมื่อตรวจพบเป้า
        // (ต้องยืนยันกับฮาร์ดแวร์จริง; ถ้าต้องการนับจริงต้องใช้หลาย gate/หลายโหนด)
        out.persons = r.hasTarget ? 1 : 0;
        // confidence ประมาณจากพลังงานสูงสุดของ moving/static (0–100 → 0–1)
        uint8_t energy = r.movingEnergy > r.staticEnergy ? r.movingEnergy : r.staticEnergy;
        out.confidence = (float)energy / 100.0f;
        if (out.confidence > 1.0f) out.confidence = 1.0f;
        _last = out;
    }

    HardwareSerial     _serial{2};
    ld2410::FrameParser _parser;
    PresenceReading    _last;
};
