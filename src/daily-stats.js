import { isOnlineStatus } from "./format.js";
import path from "node:path";
import { STATUS } from "./scraper.js";
import {
  getBusinessSessionKey,
  getEndedSessionKey,
  shouldSendDailySummaryNow,
} from "./business-hours.js";
import { buildDailySummaryEmbed } from "./format.js";
import { addHistory } from "./store.js";
import { saveDailyReportFiles } from "./daily-report-files.js";
import { maybeSendWeeklySummary } from "./weekly-report.js";

function ensureBoyStat(boys, boyId, name) {
  if (!boys[boyId]) {
    boys[boyId] = {
      name,
      onlineMinutes: 0,
      waitingMinutes: 0,
      inCallMinutes: 0,
    };
    return;
  }
  boys[boyId].name = name;
  if (!Number.isFinite(boys[boyId].waitingMinutes)) boys[boyId].waitingMinutes = 0;
  if (!Number.isFinite(boys[boyId].inCallMinutes)) boys[boyId].inCallMinutes = 0;
  if (!Number.isFinite(boys[boyId].onlineMinutes)) boys[boyId].onlineMinutes = 0;
}

function accumulateBoyMinutes(boys, boy, deltaMinutes) {
  ensureBoyStat(boys, boy.boyId, boy.name);
  if (boy.status === STATUS.WAITING) {
    boys[boy.boyId].waitingMinutes += deltaMinutes;
    boys[boy.boyId].onlineMinutes += deltaMinutes;
  } else if (boy.status === STATUS.IN_CALL) {
    boys[boy.boyId].inCallMinutes += deltaMinutes;
    boys[boy.boyId].onlineMinutes += deltaMinutes;
  }
}

/**
 * @param {object} config
 * @param {Array<{ boyId: string, name: string, status: string }>} statuses
 * @param {Date} [now]
 */
export function tickDailyStats(config, statuses, now = new Date()) {
  const settings = config.settings || {};
  if (settings.dailySummaryEnabled === false) return;

  if (!config.dailyOnlineStats) {
    config.dailyOnlineStats = { sessionKey: null, boys: {}, lastTickAt: null };
  }

  const sessionKey = getBusinessSessionKey(now, settings);
  if (!sessionKey) {
    config.dailyOnlineStats.lastTickAt = now.toISOString();
    return;
  }

  const stats = config.dailyOnlineStats;
  if (stats.sessionKey !== sessionKey) {
    config.dailyOnlineStats = {
      sessionKey,
      boys: {},
      lastTickAt: null,
    };
  }

  const current = config.dailyOnlineStats;
  let deltaMinutes = config.pollIntervalMinutes || 2;

  if (current.lastTickAt) {
    const elapsed =
      (now.getTime() - new Date(current.lastTickAt).getTime()) / 60000;
    if (elapsed > 0 && elapsed <= 180) {
      deltaMinutes = elapsed;
    }
  }

  for (const boy of statuses) {
    if (!isOnlineStatus(boy.status)) continue;
    accumulateBoyMinutes(current.boys, boy, deltaMinutes);
  }

  current.lastTickAt = now.toISOString();
}

/**
 * @returns {{ ok: true, stats: { sessionKey: string, boys: object } } | { ok: false, reason: string }}
 */
export function getCurrentBusinessDayStats(config, now = new Date()) {
  const settings = config.settings || {};
  const sessionKey = getBusinessSessionKey(now, settings);
  if (!sessionKey) {
    return { ok: false, reason: "closed" };
  }

  const stored = config.dailyOnlineStats;
  const boys =
    stored?.sessionKey === sessionKey && stored?.boys
      ? JSON.parse(JSON.stringify(stored.boys))
      : {};

  return {
    ok: true,
    stats: { sessionKey, boys },
  };
}

let summaryHandle = null;

export function startDailySummaryScheduler(client, getConfig, persistConfig) {
  stopDailySummaryScheduler();

  summaryHandle = setInterval(() => {
    maybeSendDailySummary(client, getConfig, persistConfig).catch((err) => {
      console.error("[daily-summary] 送信チェックエラー:", err.message);
    });
  }, 60 * 1000);

  maybeSendDailySummary(client, getConfig, persistConfig).catch((err) => {
    console.error("[daily-summary] 初回チェックエラー:", err.message);
  });

  console.log("[daily-summary] 01:00 サマリー送信スケジューラを開始");
}

export function stopDailySummaryScheduler() {
  if (summaryHandle) {
    clearInterval(summaryHandle);
    summaryHandle = null;
  }
}

export async function maybeSendDailySummary(client, getConfig, persistConfig) {
  const config = getConfig();
  const settings = config.settings || {};

  if (settings.dailySummaryEnabled === false) return;
  if (!shouldSendDailySummaryNow(new Date(), settings)) return;

  const sessionKey = getEndedSessionKey(new Date(), settings);
  if (!sessionKey) return;
  if (config.lastDailySummarySessionKey === sessionKey) return;

  const stats =
    config.dailyOnlineStats?.sessionKey === sessionKey
      ? config.dailyOnlineStats
      : { sessionKey, boys: {} };

  await sendDailySummaryNotification(client, config, stats);
  const saved = saveDailyReportFiles(config, stats);
  addHistory(config, {
    type: "daily_summary",
    sessionKey,
    onlineCount: Object.keys(stats.boys || {}).length,
    reportJson: path.basename(saved.jsonPath),
    reportCsv: path.basename(saved.csvPath),
  });

  config.lastDailySummarySessionKey = sessionKey;
  config.dailyOnlineStats = {
    sessionKey: getBusinessSessionKey(new Date(), settings),
    boys: {},
    lastTickAt: null,
  };
  persistConfig();

  await maybeSendWeeklySummary(client, getConfig, persistConfig);
}

export async function sendDailySummaryNotification(client, config, stats) {
  const channelId = config.notifyChannelId;
  if (!channelId) {
    console.warn("[daily-summary] notifyChannelId 未設定のためスキップ");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const embed = buildDailySummaryEmbed(config, stats);
    await channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    console.log(
      `[daily-summary] サマリー送信完了 (session=${stats.sessionKey})`
    );
  } catch (err) {
    console.error("[daily-summary] 送信エラー:", err.message);
  }
}
