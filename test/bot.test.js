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
const FIXTURE_LIVER_LIST = path.join("test", "fixtures", "twoshot-liverlist.html");
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
    assert.equal(statuses.get("13187")?.status, STATUS.OFFLINE);
    assert.equal(statuses.get("12281")?.status, STATUS.WAITING);
  });

  it("parseLiverListTotal reads total count", () => {
    if (!fs.existsSync(FIXTURE_LIVER_LIST)) {
      console.log("skip: fixture not found");
      return;
    }
    const html = fs.readFileSync(FIXTURE_LIVER_LIST, "utf8");
    assert.equal(parseLiverListTotal(html), 133);
  });

  it("buildLiverListUrl includes pagination params", () => {
    assert.ok(buildLiverListUrl(1).includes("search_page_max=50"));
    assert.ok(buildLiverListUrl(2).includes("search_pageno=2"));
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
});
