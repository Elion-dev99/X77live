import { isWithinBusinessHours, getBusinessSessionKey } from "./business-hours.js";
import { getCurrentBusinessDayStats } from "./daily-stats.js";
import { saveDailyReportFiles } from "./daily-report-files.js";
import { addHistory } from "./store.js";
import path from "node:path";

let backupHandle = null;

function getBackupIntervalMs(config) {
  const hours = Number(config.settings?.reportBackupIntervalHours);
  if (!Number.isFinite(hours) || hours <= 0) return 3 * 60 * 60 * 1000;
  return hours * 60 * 60 * 1000;
}

export function shouldRunReportBackup(config, now = new Date()) {
  const settings = config.settings || {};
  if (settings.reportBackupEnabled === false) return false;
  if (settings.dailySummaryEnabled === false) return false;
  if (!isWithinBusinessHours(now, settings)) return false;

  const sessionKey = getBusinessSessionKey(now, settings);
  if (!sessionKey) return false;

  const stats = config.dailyOnlineStats;
  if (!stats || stats.sessionKey !== sessionKey) return false;

  const intervalMs = getBackupIntervalMs(config);
  const lastBackupAt = config.lastReportBackupAt
    ? new Date(config.lastReportBackupAt).getTime()
    : 0;

  if (config.lastReportBackupSessionKey !== sessionKey) {
    return true;
  }

  return now.getTime() - lastBackupAt >= intervalMs;
}

export function maybeSaveReportBackup(config, now = new Date(), reportsDir) {
  if (!shouldRunReportBackup(config, now)) {
    return null;
  }

  const result = getCurrentBusinessDayStats(config, now);
  if (!result.ok) return null;

  const saved = saveDailyReportFiles(
    config,
    result.stats,
    now,
    reportsDir,
    { interim: true, kind: "backup" }
  );

  config.lastReportBackupAt = now.toISOString();
  config.lastReportBackupSessionKey = result.stats.sessionKey;

  addHistory(config, {
    type: "report_backup",
    sessionKey: result.stats.sessionKey,
    onlineCount: Object.keys(result.stats.boys || {}).length,
    reportJson: path.basename(saved.jsonPath),
    reportCsv: path.basename(saved.csvPath),
  });

  console.log(
    `[report-backup] 営業中スナップショット保存: ${result.stats.sessionKey} (${Object.keys(result.stats.boys || {}).length}名)`
  );

  return saved;
}

export function startReportBackupScheduler(client, getConfig, persistConfig) {
  stopReportBackupScheduler();

  backupHandle = setInterval(() => {
    tickReportBackup(getConfig, persistConfig).catch((err) => {
      console.error("[report-backup] バックアップチェックエラー:", err.message);
    });
  }, 60 * 1000);

  tickReportBackup(getConfig, persistConfig).catch((err) => {
    console.error("[report-backup] 初回チェックエラー:", err.message);
  });

  const config = getConfig();
  const hours = config.settings?.reportBackupIntervalHours || 3;
  console.log(`[report-backup] 営業中レポート自動バックアップを開始 (${hours}時間間隔)`);
}

export function stopReportBackupScheduler() {
  if (backupHandle) {
    clearInterval(backupHandle);
    backupHandle = null;
  }
}

async function tickReportBackup(getConfig, persistConfig) {
  const config = getConfig();
  const saved = maybeSaveReportBackup(config);
  if (saved) {
    persistConfig();
  }
}
