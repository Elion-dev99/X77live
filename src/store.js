import fs from "node:fs";
import path from "node:path";
import { buildLiverListUrl } from "./scraper.js";

function initDataDir() {
  const preferred = process.env.DATA_DIR || "data";
  const candidates = [path.resolve(preferred), path.resolve("data")];

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      if (dir !== path.resolve(preferred)) {
        console.warn(
          `[warn] DATA_DIR=${preferred} は使えないため ${dir} を使用します`
        );
      }
      return dir;
    } catch (err) {
      console.warn(`[warn] data dir unavailable: ${dir} (${err.message})`);
    }
  }

  throw new Error("書き込み可能な data ディレクトリを確保できません");
}

const DATA_DIR = initDataDir();
console.log("[boot] using DATA_DIR=", DATA_DIR);

const CONFIG_FILE = path.join(DATA_DIR, "config.json");

export function defaultConfig() {
  return {
    storeName: process.env.STORE_NAME?.trim() || "大阪店",
    shopId: process.env.SHOP_ID?.trim() || "4",
    notifyChannelId: process.env.NOTIFY_CHANNEL_ID?.trim() || null,
    adminUserId: process.env.ADMIN_USER_ID?.trim() || null,
    adminUserIds: (process.env.ADMIN_USER_ID || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    notifyIntervalMinutes: Number(process.env.NOTIFY_INTERVAL_MINUTES) || 10,
    pollIntervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES) || 2,
    notifyEnabled: process.env.NOTIFY_ENABLED !== "false",
    adminRoleIds: (process.env.ADMIN_ROLE_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mentionRoleId: process.env.MENTION_ROLE_ID?.trim() || null,
    auth: {
      passwordHash: null,
      passwordSalt: null,
      sessions: {},
      sessionHours: Number(process.env.AUTH_SESSION_HOURS) || 8,
    },
    boys: {},
    boyStatuses: {},
    history: [],
    dailyOnlineStats: null,
    lastDailySummarySessionKey: null,
    lastReportBackupAt: null,
    lastReportBackupSessionKey: null,
    lastConfigBackupAt: null,
    lastWeeklySummaryWeekKey: null,
    lastShiftFetch: null,
    lastShiftCompare: null,
    shiftAlertState: {},
    botLiveness: {
      alertSent: false,
      lastAlertAt: null,
    },
    scrapeHealth: {
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastError: null,
      alertSent: false,
      lastSuccessAt: null,
    },
    settings: {
      showWaitingList: true,
      showInCallList: true,
      showOfflineList: true,
      embedColorWaiting: "#57F287",
      embedColorInCall: "#FEE75C",
      embedColorOffline: "#99AAB5",
      embedColorSummary: "#5865F2",
      quietHoursStart: null,
      quietHoursEnd: null,
      pingOnStatusChange: true,
      pingOnNewBoy: true,
      dailySummaryEnabled: true,
      businessHoursOpen: process.env.BUSINESS_HOURS_OPEN?.trim() || "13:00",
      businessHoursClose: process.env.BUSINESS_HOURS_CLOSE?.trim() || "01:00",
      monitorBusinessHoursOnly: process.env.MONITOR_BUSINESS_HOURS_ONLY !== "false",
      dailySummaryAt: process.env.DAILY_SUMMARY_AT?.trim() || "01:00",
      dailyChartDmEnabled: process.env.DAILY_CHART_DM_ENABLED !== "false",
      lineDailySummaryEnabled: process.env.LINE_DAILY_SUMMARY_ENABLED !== "false",
      lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || null,
      lineGroupId: process.env.LINE_GROUP_ID?.trim() || null,
      scrapeAlertEnabled: process.env.SCRAPE_ALERT_ENABLED !== "false",
      scrapeAlertThreshold: Number(process.env.SCRAPE_ALERT_THRESHOLD) || 3,
      reportBackupEnabled: process.env.REPORT_BACKUP_ENABLED !== "false",
      reportBackupIntervalHours:
        Number(process.env.REPORT_BACKUP_INTERVAL_HOURS) || 3,
      reportBackupNotifyAdmin: process.env.REPORT_BACKUP_NOTIFY_ADMIN !== "false",
      configBackupEnabled: process.env.CONFIG_BACKUP_ENABLED !== "false",
      configBackupIntervalHours:
        Number(process.env.CONFIG_BACKUP_INTERVAL_HOURS) || 3,
      botLivenessEnabled: process.env.BOT_LIVENESS_ENABLED !== "false",
      botLivenessMinutes: Number(process.env.BOT_LIVENESS_MINUTES) || 10,
      weeklySummaryEnabled: process.env.WEEKLY_SUMMARY_ENABLED !== "false",
      shiftCheckEnabled: process.env.SHIFT_CHECK_ENABLED !== "false",
      shiftAlertEnabled: process.env.SHIFT_ALERT_ENABLED !== "false",
      shiftGraceMinutes: Number(process.env.SHIFT_GRACE_MINUTES) || 15,
      statusChangeChannelId: null,
      maxHistoryEntries: 200,
      sortBy: "name",
      footerText: "X77live 大阪店 オンライン監視",
      liveUrl: buildLiverListUrl(1, process.env.SHOP_ID?.trim() || "4"),
    },
    lastNotifyAt: null,
    lastScrapeAt: null,
    lastSummary: null,
  };
}

import {
  initPasswordFromEnv,
  ensureAuthConfig,
} from "./auth.js";

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const config = defaultConfig();
    initPasswordFromEnv(config);
    saveConfig(config);
    return config;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const defaults = defaultConfig();
    const config = {
      ...defaults,
      ...raw,
      adminUserId: raw.adminUserId || defaults.adminUserId,
      adminUserIds: Array.isArray(raw.adminUserIds)
        ? raw.adminUserIds
        : defaults.adminUserIds,
      settings: { ...defaults.settings, ...(raw.settings || {}) },
      auth: { ...defaults.auth, ...(raw.auth || {}) },
      boys: raw.boys && typeof raw.boys === "object" ? raw.boys : {},
      boyStatuses:
        raw.boyStatuses && typeof raw.boyStatuses === "object"
          ? raw.boyStatuses
          : {},
      history: Array.isArray(raw.history) ? raw.history : [],
      dailyOnlineStats: raw.dailyOnlineStats || null,
      lastDailySummarySessionKey: raw.lastDailySummarySessionKey || null,
      lastReportBackupAt: raw.lastReportBackupAt || null,
      lastReportBackupSessionKey: raw.lastReportBackupSessionKey || null,
      lastConfigBackupAt: raw.lastConfigBackupAt || null,
      lastWeeklySummaryWeekKey: raw.lastWeeklySummaryWeekKey || null,
      lastShiftFetch: raw.lastShiftFetch || null,
      lastShiftCompare: raw.lastShiftCompare || null,
      shiftAlertState:
        raw.shiftAlertState && typeof raw.shiftAlertState === "object"
          ? raw.shiftAlertState
          : {},
      botLiveness: {
        ...defaults.botLiveness,
        ...(raw.botLiveness && typeof raw.botLiveness === "object"
          ? raw.botLiveness
          : {}),
      },
      scrapeHealth: {
        ...defaults.scrapeHealth,
        ...(raw.scrapeHealth && typeof raw.scrapeHealth === "object"
          ? raw.scrapeHealth
          : {}),
      },
      adminRoleIds: Array.isArray(raw.adminRoleIds)
        ? raw.adminRoleIds
        : defaults.adminRoleIds,
    };
    ensureAuthConfig(config);
    const hadHash = Boolean(config.auth.passwordHash);
    initPasswordFromEnv(config);
    const forceReset =
      process.env.ADMIN_PASSWORD_RESET === "true" ||
      process.env.ADMIN_PASSWORD_RESET === "1";
    if (forceReset && process.env.ADMIN_PASSWORD?.trim()) {
      saveConfig(config);
    } else if (!hadHash && config.auth.passwordHash) {
      saveConfig(config);
    }
    return config;
  } catch (err) {
    console.error("[store] config load error:", err.message);
    return defaultConfig();
  }
}

export function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export function addHistory(config, entry) {
  config.history.push({
    ...entry,
    at: new Date().toISOString(),
  });
  const max = config.settings.maxHistoryEntries || 200;
  if (config.history.length > max) {
    config.history = config.history.slice(-max);
  }
}

export function getMonitoredBoys(config) {
  return Object.entries(config.boyStatuses || {})
    .map(([boyId, info]) => ({ boyId, ...info }))
    .filter((b) => {
      const meta = config.boys?.[b.boyId];
      return !meta?.excluded;
    });
}

export function getBoysByStatus(config, status) {
  return getMonitoredBoys(config).filter((b) => b.status === status);
}

export { DATA_DIR };
