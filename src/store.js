import fs from "node:fs";
import path from "node:path";

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
    notifyChannelId: process.env.NOTIFY_CHANNEL_ID?.trim() || null,
    notifyIntervalMinutes: Number(process.env.NOTIFY_INTERVAL_MINUTES) || 10,
    notifyEnabled: process.env.NOTIFY_ENABLED !== "false",
    memberRoleId: process.env.MEMBER_ROLE_ID?.trim() || null,
    adminRoleIds: (process.env.ADMIN_ROLE_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mentionOffline: process.env.MENTION_OFFLINE === "true",
    mentionRoleId: process.env.MENTION_ROLE_ID?.trim() || null,
    members: {},
    sessions: {},
    history: [],
    settings: {
      showDuration: true,
      showOfflineList: true,
      showOnlineList: true,
      embedColorOnline: "#57F287",
      embedColorOffline: "#ED4245",
      embedColorSummary: "#5865F2",
      quietHoursStart: null,
      quietHoursEnd: null,
      pingOnStatusChange: true,
      statusChangeChannelId: null,
      maxHistoryEntries: 200,
      offlineThresholdMinutes: null,
      sortOnlineBy: "name",
      sortOfflineBy: "name",
      includeNoteInReport: true,
      footerText: "X77live オンライン稼働管理",
    },
    lastNotifyAt: null,
  };
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const config = defaultConfig();
    saveConfig(config);
    return config;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const defaults = defaultConfig();
    return {
      ...defaults,
      ...raw,
      settings: { ...defaults.settings, ...(raw.settings || {}) },
      members: raw.members && typeof raw.members === "object" ? raw.members : {},
      sessions:
        raw.sessions && typeof raw.sessions === "object" ? raw.sessions : {},
      history: Array.isArray(raw.history) ? raw.history : [],
      adminRoleIds: Array.isArray(raw.adminRoleIds)
        ? raw.adminRoleIds
        : defaults.adminRoleIds,
    };
  } catch (err) {
    console.error("[store] config load error:", err.message);
    return defaultConfig();
  }
}

export function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export function getMember(config, userId) {
  return config.members[userId] || null;
}

export function getOrCreateMember(config, userId, displayName) {
  if (!config.members[userId]) {
    config.members[userId] = {
      name: displayName,
      displayName,
      active: true,
      addedAt: new Date().toISOString(),
    };
  } else if (displayName && config.members[userId].displayName !== displayName) {
    config.members[userId].displayName = displayName;
    config.members[userId].name = displayName;
  }
  return config.members[userId];
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

export function startSession(config, userId, note = "") {
  config.sessions[userId] = {
    startedAt: new Date().toISOString(),
    note: note || "",
  };
  addHistory(config, {
    type: "online_start",
    userId,
    note: note || "",
  });
}

export function endSession(config, userId) {
  const session = config.sessions[userId];
  if (!session) return null;

  const endedAt = new Date().toISOString();
  const durationMs =
    new Date(endedAt).getTime() - new Date(session.startedAt).getTime();

  addHistory(config, {
    type: "online_end",
    userId,
    startedAt: session.startedAt,
    endedAt,
    durationMs,
    note: session.note || "",
  });

  delete config.sessions[userId];
  return { startedAt: session.startedAt, endedAt, durationMs };
}

export function isOnline(config, userId) {
  return Boolean(config.sessions[userId]);
}

export function getActiveMembers(config) {
  return Object.entries(config.members)
    .filter(([, m]) => m.active)
    .map(([id, m]) => ({ id, ...m }));
}

export function getOnlineMembers(config) {
  return getActiveMembers(config).filter((m) => isOnline(config, m.id));
}

export function getOfflineMembers(config) {
  return getActiveMembers(config).filter((m) => !isOnline(config, m.id));
}

export { DATA_DIR };
