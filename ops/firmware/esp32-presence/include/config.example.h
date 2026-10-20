#pragma once

// ==============================================================================
// config.example.h — SHC Edge Node (ESP32 + LD2410C + Door Switch)
// คัดลอกเป็น include/config.h แล้วกรอกค่าจริง — ห้าม commit config.h
// ==============================================================================

// ─── ตัวตนโหนด ──────────────────────────────────────────────────────────────
#define SHC_ROOM_ID      "302"                 // รหัสห้อง (ตรงกับ rooms.id)
#define SHC_SENSOR_ID    "esp32-302"           // รหัสเซ็นเซอร์ต้นทาง (sensor_id)

// ─── Wi-Fi ──────────────────────────────────────────────────────────────────
#define WIFI_SSID        "CHANGE_ME"
#define WIFI_PASS        "CHANGE_ME"

// ─── MQTT Broker (Mosquitto บน Pi — ใช้ IP/Host ของ broker) ──────────────────
// 1 node = 1 credential (least privilege): topic write shc/room/<room>/presence
#define MQTT_HOST        "192.168.1.94"
#define MQTT_PORT        1883
#define MQTT_USER        "shc-edge-302"
#define MQTT_PASS        "CHANGE_ME"

// ─── Wire timing ─────────────────────────────────────────────────────────────
#define MQTT_PUBLISH_MIN_INTERVAL_MS  2000     // กัน publish ถี่เกิน
#define PRESENCE_EMPTY_HOLD_MS        30000    // หน่วงก่อนยืนยัน empty (กัน flap)
#define DOOR_DEBOUNCE_MS              50
