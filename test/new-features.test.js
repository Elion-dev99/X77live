import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getWeekSessionKeys,
  isSundaySessionKey,
  formatWeekPeriod,
} from "../src/business-hours.js";
import { tickDailyStats } from "../src/daily-stats.js";
import { defaultConfig } from "../src/store.js";
import { STATUS } from "../src/scraper.js";
import {
  backupConfigSnapshot,
  shouldBackupConfig,
  restoreConfigFromBackup,
} from "../src/config-backup.js";
import {
  shouldAlertBotLiveness,
  markBotLivenessHealthy,
} from "../src/bot-liveness.js";
import {
  aggregateWeeklyFromDailyReports,
  shouldSendWeeklySummaryNow,
  saveWeeklyReportFiles,
} from "../src/weekly-report.js";
import { saveDailyReportFiles, buildDailyReportDocument } from "../src/daily-report-files.js";
import { buildDailySummaryEmbed, buildWeeklySummaryEmbed } from "../src/format.js";

function jstDate(y, m, d, h, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

describe("business-hours weekly helpers", () => {
  it("isSundaySessionKey detects Sunday session keys", () => {
    assert.equal(isSundaySessionKey("2026-08-30"), true);
    assert.equal(isSundaySessionKey("2026-08-31"), false);
  });

  it("getWeekSessionKeys returns Mon-Sun range", () => {
    assert.deepEqual(getWeekSessionKeys("2026-08-30"), [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("formatWeekPeriod labels week window", () => {
    assert.match(formatWeekPeriod("2026-08-24", "2026-08-30"), /月〜日/);
  });
});

describe("daily-stats split minutes", () => {
  it("tickDailyStats tracks waiting and in-call separately", () => {
    const config = defaultConfig();
    config.pollIntervalMinutes = 2;
    config.settings.businessHoursOpen = "13:00";
    config.settings.businessHoursClose = "01:00";

    tickDailyStats(
      config,
      [{ boyId: "1", name: "A", status: STATUS.WAITING }],
      jstDate(2026, 8, 28, 20, 0)
    );
    tickDailyStats(
      config,
      [{ boyId: "1", name: "A", status: STATUS.IN_CALL }],
      jstDate(2026, 8, 28, 20, 2)
    );

    const boy = config.dailyOnlineStats.boys["1"];
    assert.equal(boy.waitingMinutes, 2);
    assert.equal(boy.inCallMinutes, 2);
    assert.equal(boy.onlineMinutes, 4);
  });
});

describe("daily-report split fields", () => {
  it("buildDailyReportDocument includes waiting and in-call totals", () => {
    const config = defaultConfig();
    const report = buildDailyReportDocument(config, {
      sessionKey: "2026-08-28",
      boys: {
        "1": {
          name: "A",
          onlineMinutes: 60,
          waitingMinutes: 40,
          inCallMinutes: 20,
        },
      },
    });
    assert.equal(report.boys[0].waitingMinutes, 40);
    assert.equal(report.boys[0].inCallMinutes, 20);
    assert.equal(report.totalWaitingMinutes, 40);
    assert.equal(report.totalInCallMinutes, 20);
  });
});

describe("config-backup", () => {
  it("backup and restore config snapshot", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x77-config-backup-"));
    const config = defaultConfig();
    config.storeName = "backup-test";
    config.lastConfigBackupAt = null;
    assert.equal(shouldBackupConfig(config), true);

    backupConfigSnapshot(config, new Date(), tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, "backups", "config-latest.json")));

    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ ...config, storeName: "changed" }),
      "utf8"
    );

    const restored = restoreConfigFromBackup("latest", tmpDir);
    assert.equal(restored.ok, true);

    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, "config.json"), "utf8"));
    assert.equal(raw.storeName, "backup-test");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("bot-liveness", () => {
  it("shouldAlertBotLiveness when lastScrapeAt is stale during business hours", () => {
    const config = defaultConfig();
    config.settings.businessHoursOpen = "13:00";
    config.settings.businessHoursClose = "01:00";
    config.settings.botLivenessMinutes = 10;
    config.lastScrapeAt = jstDate(2026, 8, 28, 19, 0).toISOString();

    assert.equal(
      shouldAlertBotLiveness(config, jstDate(2026, 8, 28, 20, 0)),
      true
    );
  });

  it("markBotLivenessHealthy clears alert flag", () => {
    const config = defaultConfig();
    config.botLiveness = { alertSent: true, lastAlertAt: new Date().toISOString() };
    markBotLivenessHealthy(config);
    assert.equal(config.botLiveness.alertSent, false);
  });
});

describe("weekly-report", () => {
  it("shouldSendWeeklySummaryNow on Monday 01:00 after Sunday business", () => {
    const settings = { dailySummaryAt: "01:00", weeklySummaryEnabled: true };
    assert.equal(shouldSendWeeklySummaryNow(jstDate(2026, 8, 31, 1, 0), settings), true);
    assert.equal(shouldSendWeeklySummaryNow(jstDate(2026, 8, 29, 1, 0), settings), false);
  });

  it("aggregateWeeklyFromDailyReports sums daily reports", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x77-weekly-"));
    const reportsDir = path.join(tmpDir, "reports");
    const config = defaultConfig();

    for (const day of ["2026-08-24", "2026-08-25"]) {
      saveDailyReportFiles(
        config,
        {
          sessionKey: day,
          boys: {
            "1": {
              name: "A",
              onlineMinutes: 60,
              waitingMinutes: 40,
              inCallMinutes: 20,
            },
          },
        },
        jstDate(2026, 8, 25, 1, 0),
        reportsDir
      );
    }

    const weekly = aggregateWeeklyFromDailyReports(
      ["2026-08-24", "2026-08-25"],
      reportsDir
    );
    assert.equal(weekly.loadedDays, 2);
    assert.equal(weekly.boys[0].onlineMinutes, 120);
    assert.equal(weekly.boys[0].waitingMinutes, 80);
    assert.equal(weekly.boys[0].inCallMinutes, 40);

    const saved = saveWeeklyReportFiles(config, weekly, jstDate(2026, 8, 31, 1, 0), reportsDir);
    assert.ok(fs.existsSync(saved.jsonPath));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("embed builders show waiting/in-call split", () => {
    const config = defaultConfig();
    const daily = buildDailySummaryEmbed(config, {
      sessionKey: "2026-08-28",
      boys: {
        "1": {
          name: "A",
          onlineMinutes: 90,
          waitingMinutes: 60,
          inCallMinutes: 30,
        },
      },
    });
    const dailyText = JSON.stringify(daily.data);
    assert.match(dailyText, /待機/);
    assert.match(dailyText, /通話/);

    const weekly = buildWeeklySummaryEmbed(config, {
      weekStart: "2026-08-24",
      weekEnd: "2026-08-30",
      loadedDays: 7,
      totalOnlineMinutes: 90,
      boys: [
        {
          name: "A",
          onlineMinutes: 90,
          waitingMinutes: 60,
          inCallMinutes: 30,
        },
      ],
    });
    assert.match(JSON.stringify(weekly.data), /週間/);
  });
});
