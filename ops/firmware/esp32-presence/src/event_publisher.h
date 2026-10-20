// ==============================================================================
// event_publisher.h — ประกอบ payload ตาม Event Contract v0.1
// อ้างอิง: doc/raw/specs/shc_event_contract_v0.1.md
//   topic   : shc/room/{room_id}/presence   (QoS1 + retain)
//   payload : room_id, event, persons, confidence, ts (ISO8601+tz), sensor_id
// ==============================================================================
#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>

class EventPublisher {
public:
    EventPublisher(const char* roomId, const char* sensorId)
        : _roomId(roomId), _sensorId(sensorId) {}

    // event: "entered" | "count_changed" | "empty"
    String build(const char* event, int persons, float confidence) {
        JsonDocument doc;
        doc["room_id"]    = _roomId;
        doc["event"]      = event;
        doc["persons"]    = persons;
        doc["confidence"] = confidence;
        doc["ts"]         = iso8601();
        doc["sensor_id"]  = _sensorId;
        String out;
        serializeJson(doc, out);
        return out;
    }

    static String topicFor(const char* roomId) {
        return String("shc/room/") + roomId + "/presence";
    }

private:
    // ISO8601 + timezone (+07:00) — ต้องมี NTP sync ก่อน
    static String iso8601() {
        time_t now = time(nullptr);
        struct tm tmv;
        localtime_r(&now, &tmv);
        char buf[32];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S+07:00", &tmv);
        return String(buf);
    }

    const char* _roomId;
    const char* _sensorId;
};
