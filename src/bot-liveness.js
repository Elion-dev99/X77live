import { isWithinBusinessHours } from "./business-hours.js";
import { sendAdminDirectMessage } from "./admin-notify.js";
import { addHistory } from "./store.js";

function getThresholdMinutes(config) {
  const configured = Number(config.settings?.botLivenessMinutes);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return Math.max((config.pollIntervalMinutes || 2) * 3, 10);
}

export function ensureBotLiveness(config) {
  if (!config.botLiveness || typeof config.botLiveness !== "object") {
    config.botLiveness = { alertSent: false, lastAlertAt: null };
  }
  return config.botLiveness;
}

export function markBotLivenessHealthy(config) {
  const state = ensureBotLiveness(config);
  state.alertSent = false;
  state.lastAlertAt = null;
}

export function shouldAlertBotLiveness(config, now = new Date()) {
  const settings = config.settings || {};
  if (settings.botLivenessEnabled === false) return false;
  if (!isWithinBusinessHours(now, settings)) return false;
  if (!config.lastScrapeAt) return false;

  const thresholdMs = getThresholdMinutes(config) * 60 * 1000;
  const elapsed = now.getTime() - new Date(config.lastScrapeAt).getTime();
  if (elapsed < thresholdMs) return false;

  const state = ensureBotLiveness(config);
  return !state.alertSent;
}

export async function maybeSendBotLivenessAlert(client, config, persistConfig, now = new Date()) {
  if (!shouldAlertBotLiveness(config, now)) return false;

  const threshold = getThresholdMinutes(config);
  const lastScrape = config.lastScrapeAt
    ? new Date(config.lastScrapeAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "なし";

  const lines = [
    "🚨 **Bot 死活監視アラート**",
    "",
    `x77.jp の監視が **${threshold} 分以上** 更新されていません。`,
    `最終取得成功: \`${lastScrape}\``,
    "",
    "Bot プロセス停止・Discord 切断・監視ループ異常の可能性があります。",
    "Bot-Hosting の Console / Restart を確認してください。",
  ];

  await sendAdminDirectMessage(client, config, lines.join("\n"));

  const state = ensureBotLiveness(config);
  state.alertSent = true;
  state.lastAlertAt = now.toISOString();
  addHistory(config, {
    type: "bot_liveness_alert",
    thresholdMinutes: threshold,
    lastScrapeAt: config.lastScrapeAt,
  });
  persistConfig();

  console.log("[bot-liveness] 管理者DMアラート送信");
  return true;
}

let livenessHandle = null;

export function startBotLivenessScheduler(client, getConfig, persistConfig) {
  stopBotLivenessScheduler();

  livenessHandle = setInterval(() => {
    maybeSendBotLivenessAlert(client, getConfig(), persistConfig).catch((err) => {
      console.error("[bot-liveness] チェックエラー:", err.message);
    });
  }, 60 * 1000);

  maybeSendBotLivenessAlert(client, getConfig(), persistConfig).catch((err) => {
    console.error("[bot-liveness] 初回チェックエラー:", err.message);
  });

  console.log("[bot-liveness] 死活監視スケジューラを開始");
}

export function stopBotLivenessScheduler() {
  if (livenessHandle) {
    clearInterval(livenessHandle);
    livenessHandle = null;
  }
}
