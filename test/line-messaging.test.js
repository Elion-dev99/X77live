import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailySummaryLineText,
  isLineDailySummaryConfigured,
  sendDailySummaryToLineGroup,
} from "../src/line-messaging.js";
import { defaultConfig } from "../src/store.js";

describe("line-messaging", () => {
  it("buildDailySummaryLineText includes ranking and totals", () => {
    const config = defaultConfig();
    const text = buildDailySummaryLineText(config, {
      sessionKey: "2026-09-05",
      boys: {
        "1": {
          name: "太郎",
          onlineMinutes: 120,
          waitingMinutes: 80,
          inCallMinutes: 40,
        },
        "2": {
          name: "花子",
          onlineMinutes: 60,
          waitingMinutes: 60,
          inCallMinutes: 0,
        },
      },
    });

    assert.match(text, /本日のオンライン稼働サマリー/);
    assert.match(text, /2026-09-05/);
    assert.match(text, /太郎/);
    assert.match(text, /花子/);
    assert.match(text, /日次確定サマリーのみ/);
  });

  it("buildDailySummaryLineText handles empty day", () => {
    const config = defaultConfig();
    const text = buildDailySummaryLineText(config, {
      sessionKey: "2026-09-05",
      boys: {},
    });
    assert.match(text, /記録がありません/);
  });

  it("isLineDailySummaryConfigured requires token and group", () => {
    const prevToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const prevGroup = process.env.LINE_GROUP_ID;
    const prevEnabled = process.env.LINE_DAILY_SUMMARY_ENABLED;
    try {
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      delete process.env.LINE_GROUP_ID;
      delete process.env.LINE_DAILY_SUMMARY_ENABLED;
      assert.equal(isLineDailySummaryConfigured(defaultConfig()), false);

      process.env.LINE_CHANNEL_ACCESS_TOKEN = "token";
      process.env.LINE_GROUP_ID = "Cxxxxxxxx";
      assert.equal(isLineDailySummaryConfigured(defaultConfig()), true);

      process.env.LINE_DAILY_SUMMARY_ENABLED = "false";
      assert.equal(isLineDailySummaryConfigured(defaultConfig()), false);
    } finally {
      if (prevToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      else process.env.LINE_CHANNEL_ACCESS_TOKEN = prevToken;
      if (prevGroup === undefined) delete process.env.LINE_GROUP_ID;
      else process.env.LINE_GROUP_ID = prevGroup;
      if (prevEnabled === undefined) delete process.env.LINE_DAILY_SUMMARY_ENABLED;
      else process.env.LINE_DAILY_SUMMARY_ENABLED = prevEnabled;
    }
  });

  it("sendDailySummaryToLineGroup posts push message", async () => {
    const prevToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const prevGroup = process.env.LINE_GROUP_ID;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
    process.env.LINE_GROUP_ID = "Cgroup123";
    delete process.env.LINE_DAILY_SUMMARY_ENABLED;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => "",
    }));

    try {
      const ok = await sendDailySummaryToLineGroup(defaultConfig(), {
        sessionKey: "2026-09-05",
        boys: {
          "1": {
            name: "太郎",
            onlineMinutes: 30,
            waitingMinutes: 30,
            inCallMinutes: 0,
          },
        },
      });
      assert.equal(ok, true);
      assert.equal(globalThis.fetch.mock.callCount(), 1);
      const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
      assert.equal(url, "https://api.line.me/v2/bot/message/push");
      assert.equal(opts.method, "POST");
      assert.match(opts.headers.Authorization, /Bearer test-token/);
      const body = JSON.parse(opts.body);
      assert.equal(body.to, "Cgroup123");
      assert.equal(body.messages[0].type, "text");
      assert.match(body.messages[0].text, /太郎/);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      else process.env.LINE_CHANNEL_ACCESS_TOKEN = prevToken;
      if (prevGroup === undefined) delete process.env.LINE_GROUP_ID;
      else process.env.LINE_GROUP_ID = prevGroup;
    }
  });
});
