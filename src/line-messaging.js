/**
 * LINE Messaging API — 日次サマリーのみ幹部グループへ送信
 * （定期通知・ステータス変更などは送らない）
 */

import { formatDurationMinutes, formatSessionPeriod } from "./business-hours.js";
import { getLogger } from "./logger.js";

const logger = getLogger("line");

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const MAX_RANKING_LINES = 20;
const MAX_TEXT_LENGTH = 4900;

function getLineConfig(config = {}) {
  const settings = config.settings || {};
  const token =
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    settings.lineChannelAccessToken ||
    null;
  const groupId =
    process.env.LINE_GROUP_ID?.trim() || settings.lineGroupId || null;
  const enabledEnv = process.env.LINE_DAILY_SUMMARY_ENABLED;
  const enabled =
    enabledEnv === undefined || enabledEnv === ""
      ? settings.lineDailySummaryEnabled !== false
      : enabledEnv !== "false";

  return { token, groupId, enabled };
}

export function isLineDailySummaryConfigured(config = {}) {
  const { token, groupId, enabled } = getLineConfig(config);
  return Boolean(enabled && token && groupId);
}

/**
 * Discord Embed 相当を LINE テキストに整形
 * @param {object} config
 * @param {{ sessionKey: string, boys: Record<string, object> }} stats
 */
export function buildDailySummaryLineText(config, stats) {
  const settings = config.settings || {};
  const period = formatSessionPeriod(stats.sessionKey, settings);
  const entries = Object.entries(stats.boys || {})
    .map(([boyId, info]) => ({
      boyId,
      name: info.name,
      onlineMinutes: info.onlineMinutes || 0,
      waitingMinutes: info.waitingMinutes || 0,
      inCallMinutes: info.inCallMinutes || 0,
    }))
    .sort(
      (a, b) =>
        b.onlineMinutes - a.onlineMinutes ||
        a.name.localeCompare(b.name, "ja")
    );

  const lines = [
    `📊 ${config.storeName || "大阪店"} — 本日のオンライン稼働サマリー`,
    "",
    `営業日: ${stats.sessionKey}`,
    `営業時間: ${period}`,
  ];

  if (entries.length === 0) {
    lines.push("", "本営業日はオンライン稼働の記録がありませんでした。");
    return lines.join("\n").slice(0, MAX_TEXT_LENGTH);
  }

  const totalMinutes = entries.reduce((sum, e) => sum + e.onlineMinutes, 0);
  lines.push(
    `オンライン稼働: ${entries.length} 名`,
    `合計: ${formatDurationMinutes(totalMinutes)}`,
    "",
    "【稼働ランキング】"
  );

  const display = entries.slice(0, MAX_RANKING_LINES);
  for (let i = 0; i < display.length; i++) {
    const e = display[i];
    lines.push(
      `${i + 1}. ${e.name} — ${formatDurationMinutes(e.onlineMinutes)}（待機 ${formatDurationMinutes(e.waitingMinutes)} / 通話 ${formatDurationMinutes(e.inCallMinutes)}）`
    );
  }

  const hidden = entries.length - display.length;
  if (hidden > 0) {
    lines.push(`…他 ${hidden} 名は Discord / レポート参照`);
  }

  lines.push("", "※ 日次確定サマリーのみ自動送信（途中経過・定期通知は送っていません）");

  return lines.join("\n").slice(0, MAX_TEXT_LENGTH);
}

/**
 * @param {string} token
 * @param {string} to groupId or userId
 * @param {Array<object>} messages
 */
export async function pushLineMessages(token, to, messages) {
  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE Push HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

/**
 * 日次サマリーのみ幹部 LINE グループへ送信
 * @returns {Promise<boolean>}
 */
export async function sendDailySummaryToLineGroup(config, stats) {
  const { token, groupId, enabled } = getLineConfig(config);

  if (!enabled) {
    logger.debug("LINE 日次サマリーは無効のためスキップ");
    return false;
  }
  if (!token || !groupId) {
    logger.debug("LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID 未設定のためスキップ");
    return false;
  }

  const text = buildDailySummaryLineText(config, stats);
  await pushLineMessages(token, groupId, [{ type: "text", text }]);
  logger.info(`日次サマリーを LINE グループへ送信 (session=${stats.sessionKey})`);
  return true;
}
