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
      settings: { ...defaults.settings, ...(raw.settings || {}) },
      auth: { ...defaults.auth, ...(raw.auth || {}) },
      boys: raw.boys && typeof raw.boys === "object" ? raw.boys : {},
      boyStatuses:
        raw.boyStatuses && typeof raw.boyStatuses === "object"
          ? raw.boyStatuses
          : {},
      history: Array.isArray(raw.history) ? raw.history : [],
      adminRoleIds: Array.isArray(raw.adminRoleIds)
        ? raw.adminRoleIds
        : defaults.adminRoleIds,
    };
    ensureAuthConfig(config);
    initPasswordFromEnv(config);
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
