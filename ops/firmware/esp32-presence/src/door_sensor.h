// ==============================================================================
// door_sensor.h — Magnetic reed switch (NO) บน GPIO → opened/closed + debounce
//   ใช้ INPUT_PULLUP: สวิตช์ปิด (ประตูปิด) = LOW, เปิด = HIGH (ปรับตามจริง)
//   ประตูเป็น "พยานหลัก" ของ idle clock (Gate 2) — โหนด publish เฉพาะสถานะ presence
//   ส่วนประตูส่งผ่าน route /api/door/events แยก (ดู api/server.js)
// ==============================================================================
#pragma once

#include <Arduino.h>

class DoorSensor {
public:
    explicit DoorSensor(uint8_t pin) : _pin(pin) {}

    void begin() {
        pinMode(_pin, INPUT_PULLUP);
        _lastRaw = digitalRead(_pin);
        _stableClosed = (_lastRaw == LOW);
        _lastChangeMs = millis();
    }

    // คืนค่า true เมื่อประตูเปลี่ยนสถานะ (ผ่าน debounce แล้ว)
    bool poll() {
        bool raw = digitalRead(_pin);
        if (raw != _lastRaw) {
            _lastRaw = raw;
            _lastChangeMs = millis();
        }
        if ((millis() - _lastChangeMs) >= DOOR_DEBOUNCE_MS) {
            bool closed = (raw == LOW);
            if (closed != _stableClosed) {
                _stableClosed = closed;
                return true;   // มีการเปลี่ยนสถานะที่ยืนยันแล้ว
            }
        }
        return false;
    }

    bool isClosed() const { return _stableClosed; }

private:
    uint8_t _pin;
    bool    _lastRaw = LOW;
    bool    _stableClosed = true;
    uint32_t _lastChangeMs = 0;
};
