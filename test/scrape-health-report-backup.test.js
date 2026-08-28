import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { defaultConfig } from "../src/store.js";
import {
  ensureScrapeHealth,
  handleScrapeFailure,
  handleScrapeSuccess,
} from "../src/scrape-health.js";
import {
  shouldRunReportBackup,
  maybeSaveReportBackup,
} from "../src/report-backup.js";
import { saveDailyReportFiles } from "../src/daily-report-files.js";
import { STATUS } from "../src/scraper.js";

function jstDate(y, m, d, h, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

describe("scrape-health", () => {
  it("ensureScrapeHealth initializes defaults", () => {
    const config = defaultConfig();
    delete config.scrapeHealth;
    const health = ensureScrapeHealth(config);
    assert.equal(health.consecutiveFailures, 0);
    assert.equal(health.alertSent, false);
  });

  it("handleScrapeFailure increments counter and sends alert at threshold", async () => {
    const config = defaultConfig();
    config.settings.scrapeAlertThreshold = 3;
    const sent = [];
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async (payload) => sent.push(payload),
        }),
      },
    };
    let persisted = 0;
    const persist = () => {
      persisted += 1;
    };

    await handleScrapeFailure(config, client, persist, new Error("timeout"));
    await handleScrapeFailure(config, client, persist, new Error("timeout"));
    assert.equal(config.scrapeHealth.consecutiveFailures, 2);
    assert.equal(sent.length, 0);

    await handleScrapeFailure(config, client, persist, new Error("timeout"));
    assert.equal(config.scrapeHealth.consecutiveFailures, 3);
    assert.equal(config.scrapeHealth.alertSent, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /取得失敗アラート/);
    assert.ok(persisted >= 3);
  });

  it("handleScrapeSuccess sends recovery after failures and resets health", async () => {
    const config = defaultConfig();
    config.scrapeHealth = {
      consecutiveFailures: 4,
      lastFailureAt: new Date().toISOString(),
      lastError: "timeout",
      alertSent: true,
      lastSuccessAt: null,
    };
    const sent = [];
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async (payload) => sent.push(payload),
        }),
      },
    };
    let persisted = 0;

    await handleScrapeSuccess(config, client, () => {
      persisted += 1;
    });

    assert.equal(config.scrapeHealth.consecutiveFailures, 0);
    assert.equal(config.scrapeHealth.alertSent, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /復旧/);
    assert.equal(persisted, 1);
  });
});

describe("report-backup", () => {
  it("shouldRunReportBackup is true during business hours after interval", () => {
    const config = defaultConfig();
    config.settings.businessHoursOpen = "13:00";
    config.settings.businessHoursClose = "01:00";
    config.settings.reportBackupIntervalHours = 3;
    config.dailyOnlineStats = {
      sessionKey: "2026-08-28",
      boys: { "1": { name: "A", onlineMinutes: 10 } },
      lastTickAt: new Date().toISOString(),
    };
    config.lastReportBackupAt = jstDate(2026, 8, 28, 14, 0).toISOString();
    config.lastReportBackupSessionKey = "2026-08-28";

    const tooSoon = jstDate(2026, 8, 28, 16, 30);
    assert.equal(shouldRunReportBackup(config, tooSoon), false);

    const due = jstDate(2026, 8, 28, 17, 1);
    assert.equal(shouldRunReportBackup(config, due), true);
  });

  it("shouldRunReportBackup is false outside business hours", () => {
    const config = defaultConfig();
    config.dailyOnlineStats = {
      sessionKey: "2026-08-28",
      boys: { "1": { name: "A", onlineMinutes: 10 } },
      lastTickAt: new Date().toISOString(),
    };
    config.lastReportBackupAt = null;

    assert.equal(
      shouldRunReportBackup(config, jstDate(2026, 8, 28, 10, 0)),
      false
    );
  });

  it("maybeSaveReportBackup writes interim backup files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x77-backup-"));
    const reportsDir = path.join(tmpDir, "reports");
    const config = defaultConfig();
    config.settings.businessHoursOpen = "13:00";
    config.settings.businessHoursClose = "01:00";
    config.settings.reportBackupIntervalHours = 3;
    config.dailyOnlineStats = {
      sessionKey: "2026-08-28",
      boys: {
        "10235": { name: "つむぎ", onlineMinutes: 90 },
      },
      lastTickAt: new Date().toISOString(),
    };
    config.lastReportBackupAt = null;

    const now = jstDate(2026, 8, 28, 20, 0);
    const saved = maybeSaveReportBackup(config, now, reportsDir);
    assert.ok(saved);
    assert.ok(fs.existsSync(saved.jsonPath));

    const report = JSON.parse(fs.readFileSync(saved.jsonPath, "utf8"));
    assert.equal(report.interim, true);
    assert.equal(report.sessionKey, "2026-08-28");
    assert.equal(config.lastReportBackupSessionKey, "2026-08-28");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saveDailyReportFiles marks backup kind in index", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x77-backup-index-"));
    const reportsDir = path.join(tmpDir, "reports");
    const config = defaultConfig();
    const stats = {
      sessionKey: "2026-08-28",
      boys: { "1": { name: "A", onlineMinutes: 10 } },
    };

    saveDailyReportFiles(
      config,
      stats,
      jstDate(2026, 8, 28, 20, 0),
      reportsDir,
      { interim: true, kind: "backup" }
    );

    const index = JSON.parse(
      fs.readFileSync(path.join(reportsDir, "index.json"), "utf8")
    );
    assert.equal(index[0].kind, "backup");
    assert.equal(index[0].interim, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
