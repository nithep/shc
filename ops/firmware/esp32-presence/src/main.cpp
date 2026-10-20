// ==============================================================================
// main.cpp — SHC Edge Node entry (ESP32 + LD2410C + Magnetic Door Switch)
//
// หลักการ (บังคับ):
//   - Read-only ต่อระบบไฟ: publish สถานะ presence เท่านั้น ห้ามส่งคำสั่งตัดไฟ
//   - สัญญา event v0.1: shc/room/{room_id}/presence QoS1 + retain
//   - Fail-safe = ON: broker หลุด → reconnect backoff, ไม่กระทำต่อรีเลย์
// ==============================================================================
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>

#include "config.h"            // คัดลอกจาก config.example.h (gitignored)
#include "presence_sensor.h"
#include "door_sensor.h"
#include "event_publisher.h"

static WiFiClient   netClient;
static PubSubClient mqtt(netClient);

static PresenceSensor presence;
static DoorSensor     door(DOOR_SENSOR_PIN);
static EventPublisher publisher(SHC_ROOM_ID, SHC_SENSOR_ID);

static PresenceReading _prev;
static uint32_t _lastPublishMs = 0;
static uint32_t _emptySinceMs  = 0;

static void syncTime() {
    configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");
    Serial.print("[NTP] waiting");
    time_t now = 0;
    for (int i = 0; i < 20 && now < 1600000000; i++) { delay(500); now = time(nullptr); Serial.print("."); }
    Serial.println(" ok");
}

static void publishPresence(const char* event, int persons, float confidence) {
    String topic = EventPublisher::topicFor(SHC_ROOM_ID);
    String payload = publisher.build(event, persons, confidence);
    // QoS1 + retain=true ตาม event contract
    bool ok = mqtt.publish(topic.c_str(), payload.c_str(), /*retained=*/true);
    Serial.printf("[PUB] %s %s ok=%d\n", event, payload.c_str(), ok);
    _lastPublishMs = millis();
}

static void connectWifi() {
    if (WiFi.status() == WL_CONNECTED) return;
    Serial.printf("[WiFi] connecting %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
    Serial.println(WiFi.status() == WL_CONNECTED ? " ok" : " FAILED");
}

static void connectMqtt() {
    if (mqtt.connected()) return;
    String cid = String("shc-edge-") + SHC_ROOM_ID + "-" + String((uint32_t)esp_random(), HEX);
    Serial.printf("[MQTT] connecting %s:%d as %s\n", MQTT_HOST, MQTT_PORT, MQTT_USER);
    if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println("[MQTT] connected");
    } else {
        Serial.printf("[MQTT] failed rc=%d — retry in 3s\n", mqtt.state());
    }
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n=== SHC Edge Node boot ===");
    door.begin();
    presence.begin();
    connectWifi();
    syncTime();
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setKeepAlive(30);
    mqtt.setBufferSize(512);
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) connectWifi();
    if (!mqtt.connected()) { connectMqtt(); delay(3000); }
    mqtt.loop();

    // ─── ตรวจจับคนอยู่ ────────────────────────────────────────────────────────
    PresenceReading cur = presence.read();

    if (cur.hasTarget && cur.persons != _prev.persons) {
        const char* ev = (_prev.persons == 0 && cur.persons > 0) ? "entered"
                        : (cur.persons > 0) ? "count_changed" : "empty";
        publishPresence(ev, cur.persons, cur.confidence);
        _emptySinceMs = 0;
    } else if (!cur.hasTarget) {
        // ยืนยัน empty หลัง hold + ประตูปิด (กัน flap)
        if (_emptySinceMs == 0) _emptySinceMs = millis();
        if (_prev.persons > 0 && (millis() - _emptySinceMs) >= PRESENCE_EMPTY_HOLD_MS && door.isClosed()) {
            publishPresence("empty", 0, cur.confidence);
        }
    }

    // ─── ประตู: เปลี่ยนสถานะ → log (ส่งเข้า API ผ่าน route แยกในเฟสถัดไป) ──────
    if (door.poll()) {
        Serial.printf("[DOOR] %s\n", door.isClosed() ? "closed" : "opened");
    }

    _prev = cur;
    delay(200);
}
