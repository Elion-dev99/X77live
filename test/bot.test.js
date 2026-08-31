import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { defaultConfig, addHistory } from "../src/store.js";
import { applySetting, isInQuietHours } from "../src/config.js";
import { buildStatusEmbed, buildNotificationEmbed, buildBoyStatusChangeMessage, getOnlineCount } from "../src/format.js";
import {
  parseLivePage,
  parseRosterPage,
  parseLiverListTotal,
  buildLiverListUrl,
  mergeOsakaStatuses,
  STATUS,
} from "../src/scraper.js";

const FIXTURE_LIVE = path.join("test", "fixtures", "live-online.html");
const FIXTURE_LIVER_LIST = path.join("test", "fixtures", "twoshot-liverlist-osaka.html");
const FIXTURE_LIVER_LIST_KANSAI = path.join("test", "fixtures", "twoshot-liverlist.html");
const FIXTURE_ROSTER = path.join("test", "fixtures", "osaka-roster.html");

describe("scraper", () => {
  it("parseLivePage extracts boy statuses from online list", () => {
    if (!fs.existsSync(FIXTURE_LIVE)) {
      console.log("skip: fixture not found");
      return;
    }
    const html = fs.readFileSync(FIXTURE_LIVE, "utf8");
    const online = parseLivePage(html);
    assert.ok(online.size > 0);
    assert.ok([...online.values()].some((b) => b.status === STATUS.WAITING));
    assert.ok([...online.values()].some((b) => b.status === STATUS.IN_CALL));
  });

  it("parseLivePage marks offline boys on twoshot liver list", () => {
    if (!fs.existsSync(FIXTURE_LIVER_LIST)) {
      console.log("skip: fixture not found");
      return;
    }
    const html = fs.readFileSync(FIXTURE_LIVER_LIST, "utf8");
    const statuses = parseLivePage(html);
    assert.ok(statuses.size > 10);
    assert.ok([...statuses.values()].some((b) => b.status === STATUS.WAITING));
    assert.ok([...statuses.values()].some((b) => b.status === STATUS.OFFLINE));
    assert.equal(statuses.get("10235")?.name, "つむぎ");
  });

  it("parseLiverListTotal reads total count for Osaka shop", () => {
    if (!fs.existsSync(FIXTURE_LIVER_LIST)) {
      console.log("skip: fixture not found");
      return;
    }
    const html = fs.readFileSync(FIXTURE_LIVER_LIST, "utf8");
    assert.equal(parseLiverListTotal(html), 43);
  });

  it("buildLiverListUrl includes shop and pagination params", () => {
    assert.ok(buildLiverListUrl(1).includes("search_shop_id=4"));
    assert.ok(buildLiverListUrl(1).includes("search_page_max=50"));
    assert.ok(buildLiverListUrl(2).includes("search_pageno=2"));
    assert.ok(buildLiverListUrl(1, "9").includes("search_shop_id=9"));
  });

  it("parseRosterPage extracts boy ids", () => {
    if (!fs.existsSync(FIXTURE_ROSTER)) {
      console.log("skip: fixture not found");
      return;
    }
    const html = fs.readFileSync(FIXTURE_ROSTER, "utf8");
    const roster = parseRosterPage(html);
    assert.ok(roster.size > 10);
    assert.equal(roster.get("10235")?.name, "つむぎ");
    assert.equal(roster.get("12115")?.name, "ゆきひろ");
  });

  it("mergeOsakaStatuses marks offline boys", () => {
    const roster = new Map([
      ["100", { boyId: "100", name: "A" }],
      ["200", { boyId: "200", name: "B" }],
    ]);
    const online = new Map([
      ["100", { boyId: "100", name: "A", status: STATUS.WAITING }],
    ]);
    const merged = mergeOsakaStatuses(roster, online);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((b) => b.boyId === "100").status, STATUS.WAITING);
    assert.equal(merged.find((b) => b.boyId === "200").status, STATUS.OFFLINE);
  });

  it("parseLivePage and parseRosterPage return empty maps for invalid HTML", () => {
    assert.deepEqual(parseLivePage(""), new Map());
    assert.deepEqual(parseRosterPage("<html>broken</html>"), new Map());
  });

  it("fetchLiveOnline retries after age-check and keeps working on invalid first page", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    try {
      globalThis.fetch = async (url) => {
        calls.push(String(url));
        if (calls.length === 1) {
          return {
            ok: true,
            status: 200,
            headers: { getSetCookie: () => [] },
            text: async () => "<html><body>年齢認証</body></html>",
          };
        }

        if (calls.length === 2) {
          return {
            ok: true,
            status: 200,
            headers: { getSetCookie: () => ["X_LIVE_SERVICE=abc; path=/", "view_mode=1; path=/"] },
            text: async () => `
              <html><body>
                <li><a href="/boy_id=100"> <div class="liveinfo"><p>つむぎ</p></div> <span class="live_situation02">待機中</span></li>
              </body></html>
            `,
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { getSetCookie: () => [] },
          text: async () => "<html><body></body></html>",
        };
      };

      const result = await import("../src/scraper.js");
      const statuses = await result.fetchLiveOnline("4");
      assert.ok(statuses.has("100"));
      assert.equal(statuses.get("100").name, "つむぎ");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("store", () => {
  it("defaultConfig has Osaka shop settings", () => {
    const config = defaultConfig();
    assert.equal(config.storeName, "大阪店");
    assert.equal(config.shopId, "4");
    assert.equal(config.notifyIntervalMinutes, 10);
    assert.equal(config.pollIntervalMinutes, 2);
  });
});

describe("config", () => {
  it("applySetting updates poll interval", () => {
    const config = defaultConfig();
    const result = applySetting(config, "pollInterval", "5");
    assert.equal(result.ok, true);
    assert.equal(config.pollIntervalMinutes, 5);
  });

  it("isInQuietHours returns boolean", () => {
    const config = defaultConfig();
    config.settings.quietHoursStart = "02:00";
    config.settings.quietHoursEnd = "06:00";
    assert.equal(typeof isInQuietHours(config), "boolean");
  });
});

describe("format", () => {
  it("buildStatusEmbed groups by status", () => {
    const config = defaultConfig();
    config.boyStatuses = {
      "1": { name: "太郎", status: STATUS.WAITING, updatedAt: new Date().toISOString() },
      "2": { name: "花子", status: STATUS.IN_CALL, updatedAt: new Date().toISOString() },
      "3": { name: "次郎", status: STATUS.OFFLINE, updatedAt: new Date().toISOString() },
    };
    config.lastSummary = { total: 3, waiting: 1, inCall: 1, offline: 1 };

    const embed = buildStatusEmbed(config);
    assert.ok(embed.data.title.includes("大阪店"));
    assert.ok(embed.data.fields.length >= 3);
  });

  it("buildBoyStatusChangeMessage formats change", () => {
    const msg = buildBoyStatusChangeMessage({
      name: "太郎",
      from: STATUS.OFFLINE,
      to: STATUS.WAITING,
    });
    assert.ok(msg.includes("太郎"));
    assert.ok(msg.includes("待機中"));
  });

  it("buildNotificationEmbed excludes offline boys", () => {
    const config = defaultConfig();
    config.boyStatuses = {
      "1": { name: "太郎", status: STATUS.WAITING, updatedAt: new Date().toISOString() },
      "2": { name: "花子", status: STATUS.IN_CALL, updatedAt: new Date().toISOString() },
      "3": { name: "次郎", status: STATUS.OFFLINE, updatedAt: new Date().toISOString() },
    };
    config.lastSummary = { total: 3, waiting: 1, inCall: 1, offline: 1 };

    const embed = buildNotificationEmbed(config);
    const fields = embed.data.fields || [];
    const text = JSON.stringify(embed.data);
    assert.ok(!text.includes("次郎"));
    assert.ok(!fields.some((f) => f.name.includes("オフライン")));
    assert.equal(getOnlineCount(config), 2);
  });

  it("buildNotificationEmbed includes scheduled-not-online from shift compare", () => {
    const config = defaultConfig();
    config.boyStatuses = {
      "1": { name: "太郎", status: STATUS.WAITING, updatedAt: new Date().toISOString() },
    };
    config.lastSummary = { total: 1, waiting: 1, inCall: 0, offline: 0 };
    config.lastShiftCompare = {
      scheduledNotOnline: [
        { boyId: "99999", name: "不在", shiftTime: "14:00～22:00", status: STATUS.OFFLINE },
      ],
      onlineNotScheduled: [],
    };

    const embed = buildNotificationEmbed(config);
    const fields = embed.data.fields || [];
    const missingField = fields.find((f) => f.name.includes("未オンライン"));
    assert.ok(missingField);
    assert.ok(missingField.value.includes("不在"));
    assert.ok(missingField.value.includes("14:00～22:00"));
    assert.ok(embed.data.description.includes("シフト未オンライン"));
  });
});
