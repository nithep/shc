"use strict";

const assert = require("assert");
const { GoogleNotifier } = require("../services/google_notifier");

async function run() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log("  PASS " + name);
    } catch (e) {
      failed++;
      console.error("  FAIL " + name + "\n       " + e.message);
    }
  }

  const origEnv = process.env.NODE_ENV;
  const origChat = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  const origSheets = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const origTest = process.env.GOOGLE_TEST_WEBHOOK_URL;
  const origShcl = process.env.SHCL_TEST_WEBHOOK;

  try {
    process.env.NODE_ENV = "test";
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    delete process.env.GOOGLE_TEST_WEBHOOK_URL;
    delete process.env.SHCL_TEST_WEBHOOK;

    const notifier = new GoogleNotifier({ chatWebhookUrl: "", sheetsWebhookUrl: "" });
    let fetchCalled = false;
    const origFetch = global.fetch;
    global.fetch = async function() { fetchCalled = true; return { ok: true, status: 200, text: async () => "ok" }; };

    await test("GoogleNotifier test mode ไม่มี test webhook ระงับไม่เรียก fetch และมี log การระงับ", async () => {
      await notifier.sendCheckinAlert({ roomNumber: "101", guestName: "Test" });
      assert.strictEqual(fetchCalled, false);
    });

    global.fetch = origFetch;

    process.env.GOOGLE_TEST_WEBHOOK_URL = "https://example.com/test";
    const notifier2 = new GoogleNotifier({ chatWebhookUrl: "https://chat.googleapis.com/v1/spaces/xxx/messages?key=yyy", sheetsWebhookUrl: "" });
    let fetchCalled2 = false;
    global.fetch = async function() { fetchCalled2 = true; return { ok: true, status: 200, text: async () => "ok" }; };
    await test("GoogleNotifier test mode มี test webhook ที่ระบุชัด ส่งได้", async () => {
      await notifier2.sendCheckinAlert({ roomNumber: "102", guestName: "Test2" });
      assert.strictEqual(fetchCalled2, true);
    });
    global.fetch = origFetch;
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origChat === undefined) delete process.env.GOOGLE_CHAT_WEBHOOK_URL; else process.env.GOOGLE_CHAT_WEBHOOK_URL = origChat;
    if (origSheets === undefined) delete process.env.GOOGLE_SHEETS_WEBHOOK_URL; else process.env.GOOGLE_SHEETS_WEBHOOK_URL = origSheets;
    if (origTest === undefined) delete process.env.GOOGLE_TEST_WEBHOOK_URL; else process.env.GOOGLE_TEST_WEBHOOK_URL = origTest;
    if (origShcl === undefined) delete process.env.SHCL_TEST_WEBHOOK; else process.env.SHCL_TEST_WEBHOOK = origShcl;
  }

  console.log("\n" + (failed === 0 ? "ALL PASSED" : failed + " FAILED") + " (" + passed + " passed)\n");
  process.exit(failed === 0 ? 0 : 1);
}

run();
