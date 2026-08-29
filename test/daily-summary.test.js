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
import { tickDailyStats, getCurrentBusinessDayStats } from "../src/daily-stats.js";
import { defaultConfig } from "../src/store.js";
import { STATUS } from "../src/scraper.js";
import { saveDailyReportFiles, buildDailyReportDocument, listDailyReportFiles, resolveReportDownload, buildInterimReportFiles } from "../src/daily-report-files.js";
import { buildNewBoyMessage, buildDailySummaryEmbed, buildReportListEmbed } from "../src/format.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

  it("getCurrentBusinessDayStats returns in-progress session", () => {
    const config = defaultConfig();
    config.dailyOnlineStats = {
      sessionKey: "2026-08-28",
      boys: { "1": { name: "太郎", onlineMinutes: 30 } },
      lastTickAt: new Date().toISOString(),
    };
    config.settings.businessHoursOpen = "13:00";
    config.settings.businessHoursClose = "01:00";

    const result = getCurrentBusinessDayStats(config, jstDate(2026, 8, 28, 20, 0));
    assert.equal(result.ok, true);
    assert.equal(result.stats.sessionKey, "2026-08-28");
    assert.equal(result.stats.boys["1"].onlineMinutes, 30);

    const closed = getCurrentBusinessDayStats(config, jstDate(2026, 8, 28, 10, 0));
    assert.equal(closed.ok, false);
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

describe("daily-report-files", () => {
  it("saveDailyReportFiles writes json, csv, and index", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x77-reports-"));
    const reportsDir = path.join(tmpDir, "reports");

    const config = defaultConfig();
    const stats = {
      sessionKey: "2026-08-28",
      boys: {
        "10235": { name: "つむぎ", onlineMinutes: 150 },
        "10001": { name: "太郎", onlineMinutes: 60 },
      },
    };

    const saved = saveDailyReportFiles(
      config,
      stats,
      jstDate(2026, 8, 29, 1, 0),
      reportsDir
    );
    assert.ok(fs.existsSync(saved.jsonPath));
    assert.ok(fs.existsSync(saved.csvPath));

    const report = JSON.parse(fs.readFileSync(saved.jsonPath, "utf8"));
    assert.equal(report.sessionKey, "2026-08-28");
    assert.equal(report.boys[0].name, "つむぎ");
    assert.equal(report.boys[0].onlineMinutes, 150);

    const csv = fs.readFileSync(saved.csvPath, "utf8");
    assert.match(csv, /つむぎ/);
    assert.match(csv, /10235/);

    const index = listDailyReportFiles(reportsDir);
    assert.equal(index.length, 1);
    assert.equal(index[0].sessionKey, "2026-08-28");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolveReportDownload rejects invalid session keys", () => {
    assert.equal(resolveReportDownload("../hack", "json"), null);
    assert.equal(resolveReportDownload("2026-13-99", "json"), null);
  });

  it("resolveReportDownload returns existing files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x77-dl-"));
    const reportsDir = path.join(tmpDir, "reports");

    saveDailyReportFiles(
      defaultConfig(),
      { sessionKey: "2026-08-28", boys: { "1": { name: "A", onlineMinutes: 10 } } },
      jstDate(2026, 8, 29, 1, 0),
      reportsDir
    );

    const both = resolveReportDownload("2026-08-28", "both", reportsDir);
    assert.ok(both);
    assert.equal(both.files.length, 2);

    const csvOnly = resolveReportDownload("2026-08-28", "csv", reportsDir);
    assert.equal(csvOnly.files.length, 1);
    assert.match(csvOnly.files[0].name, /\.csv$/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("buildDailyReportDocument sorts by online minutes", () => {
    const config = defaultConfig();
    const report = buildDailyReportDocument(config, {
      sessionKey: "2026-08-28",
      boys: {
        a: { name: "B", onlineMinutes: 10 },
        b: { name: "A", onlineMinutes: 20 },
      },
    });
    assert.equal(report.boys[0].name, "A");
    assert.equal(report.boys[1].name, "B");
  });

  it("buildReportListEmbed lists saved reports", () => {
    const config = defaultConfig();
    const embed = buildReportListEmbed(config, [
      {
        sessionKey: "2026-08-28",
        period: "8/28 13:00 〜 8/29 01:00",
        onlineCount: 3,
        totalOnlineMinutes: 200,
      },
    ]);
    const text = JSON.stringify(embed.data);
    assert.match(text, /2026-08-28/);
    assert.match(text, /レポート取得/);
  });

  it("buildInterimReportFiles marks report as interim", () => {
    const config = defaultConfig();
    const { report, files } = buildInterimReportFiles(
      config,
      { sessionKey: "2026-08-28", boys: { "1": { name: "A", onlineMinutes: 10 } } },
      "both",
      jstDate(2026, 8, 28, 20, 0)
    );
    assert.equal(report.interim, true);
    assert.equal(files.length, 2);
    assert.match(files[0].name, /interim\.json$/);
  });

  it("buildDailySummaryEmbed interim mode shows as-of time", () => {
    const config = defaultConfig();
    const embed = buildDailySummaryEmbed(
      config,
      { sessionKey: "2026-08-28", boys: { "1": { name: "A", onlineMinutes: 10 } } },
      { interim: true, asOf: jstDate(2026, 8, 28, 20, 0) }
    );
    const text = JSON.stringify(embed.data);
    assert.match(text, /暫定/);
    assert.match(text, /集計時点/);
  });

  it("buildDailySummaryEmbed stays within Discord embed size for many boys", () => {
    const config = defaultConfig();
    const boys = {};
    for (let i = 0; i < 135; i++) {
      boys[String(10000 + i)] = {
        name: `ボーイ名前テスト${i}郎`,
        onlineMinutes: 120 + i,
        waitingMinutes: 80,
        inCallMinutes: 40,
      };
    }
    const embed = buildDailySummaryEmbed(
      config,
      { sessionKey: "2026-08-29", boys },
      { interim: true, asOf: jstDate(2026, 8, 29, 20, 0) }
    );
    const data = embed.data;
    let total =
      (data.title?.length || 0) +
      (data.description?.length || 0) +
      (data.footer?.text?.length || 0);
    for (const field of data.fields || []) {
      total += (field.name?.length || 0) + (field.value?.length || 0);
    }
    assert.ok(total <= 6000, `embed too large: ${total}`);
    assert.ok((data.fields?.length || 0) <= 25);
    assert.match(JSON.stringify(data), /他 \*\*110\*\* 名/);
  });
});
