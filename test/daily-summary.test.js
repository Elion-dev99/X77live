import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getJstParts,
  isWithinBusinessHours,
  getBusinessSessionKey,
  getEndedSessionKey,
  shouldSendDailySummaryNow,
  formatDurationMinutes,
  formatSessionPeriod,
} from "../src/business-hours.js";
import { tickDailyStats } from "../src/daily-stats.js";
import { defaultConfig } from "../src/store.js";
import { STATUS } from "../src/scraper.js";
import { buildNewBoyMessage, buildDailySummaryEmbed } from "../src/format.js";

function jstDate(y, m, d, h, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

describe("business-hours", () => {
  it("isWithinBusinessHours covers 13:00 through 00:59 JST", () => {
    const settings = { businessHoursOpen: "13:00", businessHoursClose: "01:00" };
    assert.equal(isWithinBusinessHours(jstDate(2026, 8, 28, 12, 59), settings), false);
    assert.equal(isWithinBusinessHours(jstDate(2026, 8, 28, 13, 0), settings), true);
    assert.equal(isWithinBusinessHours(jstDate(2026, 8, 28, 23, 0), settings), true);
    assert.equal(isWithinBusinessHours(jstDate(2026, 8, 29, 0, 30), settings), true);
    assert.equal(isWithinBusinessHours(jstDate(2026, 8, 29, 1, 0), settings), false);
  });

  it("getBusinessSessionKey uses start date across midnight", () => {
    const settings = { businessHoursOpen: "13:00", businessHoursClose: "01:00" };
    assert.equal(
      getBusinessSessionKey(jstDate(2026, 8, 28, 15, 0), settings),
      "2026-08-28"
    );
    assert.equal(
      getBusinessSessionKey(jstDate(2026, 8, 29, 0, 30), settings),
      "2026-08-28"
    );
    assert.equal(getBusinessSessionKey(jstDate(2026, 8, 29, 2, 0), settings), null);
  });

  it("getEndedSessionKey returns previous day at 01:00", () => {
    const settings = { dailySummaryAt: "01:00" };
    assert.equal(
      getEndedSessionKey(jstDate(2026, 8, 29, 1, 0), settings),
      "2026-08-28"
    );
    assert.equal(getEndedSessionKey(jstDate(2026, 8, 29, 2, 0), settings), null);
  });

  it("shouldSendDailySummaryNow triggers in 01:00-01:04 window", () => {
    const settings = { dailySummaryAt: "01:00" };
    assert.equal(shouldSendDailySummaryNow(jstDate(2026, 8, 29, 1, 0), settings), true);
    assert.equal(shouldSendDailySummaryNow(jstDate(2026, 8, 29, 1, 4), settings), true);
    assert.equal(shouldSendDailySummaryNow(jstDate(2026, 8, 29, 1, 5), settings), false);
    assert.equal(shouldSendDailySummaryNow(jstDate(2026, 8, 29, 0, 59), settings), false);
  });

  it("formatDurationMinutes renders Japanese durations", () => {
    assert.equal(formatDurationMinutes(45), "45分");
    assert.equal(formatDurationMinutes(120), "2時間");
    assert.equal(formatDurationMinutes(150), "2時間30分");
  });

  it("formatSessionPeriod shows business window", () => {
    assert.equal(
      formatSessionPeriod("2026-08-28"),
      "8/28 13:00 〜 8/29 01:00"
    );
  });
});

describe("daily-stats", () => {
  it("tickDailyStats accumulates online minutes during business hours", () => {
    const config = defaultConfig();
    config.pollIntervalMinutes = 2;
    config.settings.businessHoursOpen = "13:00";
    config.settings.businessHoursClose = "01:00";

    const now = jstDate(2026, 8, 28, 20, 0);
    tickDailyStats(
      config,
      [
        { boyId: "1", name: "太郎", status: STATUS.WAITING },
        { boyId: "2", name: "次郎", status: STATUS.OFFLINE },
      ],
      now
    );

    assert.equal(config.dailyOnlineStats.sessionKey, "2026-08-28");
    assert.equal(config.dailyOnlineStats.boys["1"].onlineMinutes, 2);
    assert.equal(config.dailyOnlineStats.boys["2"], undefined);
  });
});

describe("format new features", () => {
  it("buildNewBoyMessage includes boy name and id", () => {
    const msg = buildNewBoyMessage({ boyId: "10235", name: "つむぎ" }, "大阪店");
    assert.match(msg, /つむぎ/);
    assert.match(msg, /10235/);
    assert.match(msg, /新規ボーイ/);
  });

  it("buildDailySummaryEmbed lists ranked online durations", () => {
    const config = defaultConfig();
    const embed = buildDailySummaryEmbed(config, {
      sessionKey: "2026-08-28",
      boys: {
        "1": { name: "太郎", onlineMinutes: 120 },
        "2": { name: "次郎", onlineMinutes: 30 },
      },
    });
    const text = JSON.stringify(embed.data);
    assert.match(text, /太郎/);
    assert.match(text, /2時間/);
    assert.match(text, /次郎/);
  });
});
