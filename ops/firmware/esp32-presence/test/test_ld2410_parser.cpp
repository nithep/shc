// ==============================================================================
// test_ld2410_parser.cpp — Unit tests สำหรับ ld2410::FrameParser (host, ไม่ต้องมี Arduino)
//
// คอมไพล์/รันบน PC:
//   g++ -std=c++17 -I ../esp32-presence/src test_ld2410_parser.cpp -o test_ld2410_parser && ./test_ld2410_parser
//
// test vectors อ้างอิง: doc/raw/hardware_specs/hlk_ld2410c_uart_protocol_v1.07.md §4
//   (ผู้ผลิต V1.07) — อย่างน้อย 4 เคส:
//     1) กรอบปกติจากคู่มือ
//     2) กรอบแยกสองท่อน (feed ทีละส่วน)
//     3) ขยะนำหน้า (garbage) แล้ว resync
//     4) ท้ายกรอบผิด (footer corrupted) → drop ไม่ crash
// ==============================================================================
#include <cstdio>
#include <cstdint>
#include <vector>
#include <string>

#include "ld2410_parser.h"

static int g_pass = 0, g_fail = 0;

static void check(bool cond, const std::string& name) {
    if (cond) { g_pass++; printf("  PASS %s\n", name.c_str()); }
    else      { g_fail++; printf("  FAIL %s\n", name.c_str()); }
}

// ป้อนทุกไบต์; คืน true ถ้ามีกรอบ valid อย่างน้อยหนึ่งครั้ง
static bool feedAll(ld2410::FrameParser& p, const std::vector<uint8_t>& bytes) {
    bool valid = false;
    for (uint8_t b : bytes) if (p.feed(b)) valid = true;
    return valid;
}

static bool feedChunked(ld2410::FrameParser& p, const std::vector<uint8_t>& bytes,
                        size_t from, size_t to) {
    bool valid = false;
    for (size_t i = from; i < to && i < bytes.size(); i++) if (p.feed(bytes[i])) valid = true;
    return valid;
}

int main() {
    // [ผู้ผลิต] กรอบรายงานปกติ 23 ไบต์: state 0x02, moving 81cm@0, static 0cm@59
    const std::vector<uint8_t> normalFrame = {
        0xF4,0xF3,0xF2,0xF1, 0x0D,0x00,
        0x02,0xAA,0x02, 0x51,0x00, 0x00, 0x00,0x00, 0x3B, 0x00,0x00, 0x55,0x00,
        0xF8,0xF7,0xF6,0xF5
    };
    // [ผู้ผลิต] กรอบโหมดวิศวกรรม 45 ไบต์
    const std::vector<uint8_t> engineFrame = {
        0xF4,0xF3,0xF2,0xF1, 0x23,0x00,
        0x01,0xAA,0x03, 0x1E,0x00, 0x3C, 0x00,0x00, 0x39, 0x00,0x00,
        0x08,0x08, 0x3C,0x22,0x05,0x03,0x03,0x04,0x03,0x06,0x05,
        0x00,0x00,0x39,0x10,0x13,0x06,0x06,0x08,0x04, 0x03,0x05, 0x55,0x00,
        0xF8,0xF7,0xF6,0xF5
    };

    printf("== 1) กรอบปกติจากคู่มือ ==\n");
    {
        ld2410::FrameParser p;
        bool ok = feedAll(p, normalFrame);
        check(ok, "parse สำเร็จ");
        const ld2410::Reading& r = p.lastReading();
        check(r.valid, "valid=true");
        check(r.state == ld2410::ST_STATIC, "state=0x02 (static)");
        check(r.hasTarget == true, "hasTarget=true");
        check(r.movingDistanceCm == 81, "moving=81cm");
        check(r.movingEnergy == 0, "movingEnergy=0");
        check(r.staticDistanceCm == 0, "static=0cm");
        check(r.staticEnergy == 59, "staticEnergy=59");
        check(r.detectDistanceCm == 0, "detect=0cm");
    }

    printf("== 2) กรอบแยกสองท่อน (stateful) ==\n");
    {
        ld2410::FrameParser p;
        size_t mid = normalFrame.size() / 2;
        bool ok1 = feedChunked(p, normalFrame, 0, mid);
        bool ok2 = feedChunked(p, normalFrame, mid, normalFrame.size());
        check(!ok1, "ท่อนแรกยังไม่สมบูรณ์");
        check(ok2, "ท่อนที่สองประกอบสำเร็จ");
        check(p.lastReading().state == ld2410::ST_STATIC, "state ถูกต้องหลังต่อท่อน");
        check(p.lastReading().movingDistanceCm == 81, "moving ถูกต้องหลังต่อท่อน");
    }

    printf("== 3) ขยะนำหน้า (resync) ==\n");
    {
        ld2410::FrameParser p;
        std::vector<uint8_t> noisy = {0x00,0x12,0xAB,0xFF,0xF4,0x99}; // มี F4 ปลอมด้วย
        for (uint8_t b : noisy) p.feed(b);
        bool ok = feedAll(p, normalFrame);
        check(ok, "resync + parse สำเร็จหลังขยะนำหน้า");
        check(p.lastReading().valid, "valid=true");
    }

    printf("== 4) ท้ายกรอบผิด (footer corrupted) → drop ไม่ crash ==\n");
    {
        ld2410::FrameParser p;
        std::vector<uint8_t> bad = normalFrame;
        bad[20] = 0x00; // ทำ footer ไบต์แรก (F8) พัง
        bool ok = feedAll(p, bad);
        check(!ok, "ไม่คืน valid สำหรับกรอบท้ายผิด");
        check(!p.lastReading().valid, "lastReading ไม่ valid");
        // ต้องไม่ crash และยังรับกรอบดีต่อได้ (resync)
        bool ok2 = feedAll(p, normalFrame);
        check(ok2, "ยัง parse กรอบดีถัดไปได้");
    }

    printf("== 5) กรอบวิศวกรรม + OUT pin ==\n");
    {
        ld2410::FrameParser p;
        bool ok = feedAll(p, engineFrame);
        check(ok, "parse กรอบวิศวกรรมสำเร็จ");
        check(p.lastReading().state == ld2410::ST_MOVING_STATIC, "state=0x03 (moving+static)");
        check(p.lastReading().outPinKnown, "outPinKnown=true");
        check(p.lastReading().outPinActive == false, "OUT byte=0x05 → ไม่ active (ไม่ใช่ 0x01)");
    }

    printf("== 6) เครื่องหมายภายในผิด (data[1]!=0xAA) → drop ==\n");
    {
        ld2410::FrameParser p;
        std::vector<uint8_t> bad = normalFrame;
        bad[7] = 0x00; // data[1] ควรเป็น 0xAA
        bool ok = feedAll(p, bad);
        check(!ok, "drop กรอบที่ data head ผิด");
    }

    printf("\nResult: pass=%d fail=%d\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
