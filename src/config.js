/**
 * 設定の読み込み・検証・更新ヘルパー
 */

export function isInQuietHours(config) {
  const { quietHoursStart, quietHoursEnd } = config.settings;
  if (!quietHoursStart || !quietHoursEnd) return false;

  const now = new Date();
  const jstOffset = 9 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const jstMinutes = (utcMinutes + jstOffset) % (24 * 60);

  const [startH, startM] = quietHoursStart.split(":").map(Number);
  const [endH, endM] = quietHoursEnd.split(":").map(Number);
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return jstMinutes >= startMinutes && jstMinutes < endMinutes;
  }
  return jstMinutes >= startMinutes || jstMinutes < endMinutes;
}

export function isAdmin(member, config) {
  if (!member) return false;
  if (member.permissions?.has("Administrator")) return true;
  if (config.adminRoleIds.length === 0) return true;
  return config.adminRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

export const SETTING_KEYS = {
  storeName: { type: "string", path: "storeName" },
  shopId: { type: "string", path: "shopId" },
  notifyChannel: { type: "channel", path: "notifyChannelId" },
  notifyInterval: {
    type: "number",
    path: "notifyIntervalMinutes",
    min: 1,
    max: 1440,
  },
  pollInterval: {
    type: "number",
    path: "pollIntervalMinutes",
    min: 1,
    max: 60,
  },
  notifyEnabled: { type: "boolean", path: "notifyEnabled" },
  mentionRole: { type: "role", path: "mentionRoleId" },
  showWaiting: { type: "boolean", path: "settings.showWaitingList" },
  showInCall: { type: "boolean", path: "settings.showInCallList" },
  showOffline: { type: "boolean", path: "settings.showOfflineList" },
  pingOnChange: { type: "boolean", path: "settings.pingOnStatusChange" },
  quietStart: { type: "time", path: "settings.quietHoursStart" },
  quietEnd: { type: "time", path: "settings.quietHoursEnd" },
  footerText: { type: "string", path: "settings.footerText" },
  sortBy: { type: "enum", path: "settings.sortBy", values: ["name", "status"] },
};

export function getNestedValue(obj, dotPath) {
  return dotPath.split(".").reduce((o, k) => o?.[k], obj);
}

export function setNestedValue(obj, dotPath, value) {
  const keys = dotPath.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function applySetting(config, key, value) {
  const def = SETTING_KEYS[key];
  if (!def) return { ok: false, error: `不明な設定キー: ${key}` };

  switch (def.type) {
    case "number": {
      const num = Number(value);
      if (isNaN(num) || num < def.min || num > def.max) {
        return {
          ok: false,
          error: `${def.min}〜${def.max} の数値を指定してください`,
        };
      }
      setNestedValue(config, def.path, num);
      break;
    }
    case "boolean": {
      setNestedValue(config, def.path, value === true || value === "true");
      break;
    }
    case "time": {
      if (value && !/^\d{1,2}:\d{2}$/.test(value)) {
        return { ok: false, error: "HH:MM 形式で指定してください（例: 02:00）" };
      }
      setNestedValue(config, def.path, value || null);
      break;
    }
    case "enum": {
      if (!def.values.includes(value)) {
        return { ok: false, error: `選択肢: ${def.values.join(", ")}` };
      }
      setNestedValue(config, def.path, value);
      break;
    }
    default:
      setNestedValue(config, def.path, value);
  }

  return { ok: true };
}
