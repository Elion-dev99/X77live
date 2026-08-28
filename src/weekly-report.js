import path from "node:path";
import fs from "node:fs";
import {
  formatDurationMinutes,
  formatWeekPeriod,
  getWeekSessionKeys,
  isSundaySessionKey,
  shouldSendDailySummaryNow,
  getEndedSessionKey,
} from "./business-hours.js";
import { loadReportDocument, REPORTS_DIR } from "./daily-report-files.js";
import { buildWeeklySummaryEmbed } from "./format.js";
import { addHistory } from "./store.js";

function ensureWeeklyReportsDir(reportsDir = REPORTS_DIR) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

function normalizeReportBoy(boy) {
  const onlineMinutes = Math.round(boy.onlineMinutes || 0);
  const waitingMinutes = Math.round(boy.waitingMinutes ?? 0);
  const inCallMinutes = Math.round(boy.inCallMinutes || 0);
  return {
    boyId: boy.boyId,
    name: boy.name,
    onlineMinutes,
    waitingMinutes,
    inCallMinutes,
  };
}

export function aggregateWeeklyFromDailyReports(sessionKeys, reportsDir = REPORTS_DIR) {
  /** @type {Record<string, object>} */
  const boys = {};
  let loadedDays = 0;

  for (const sessionKey of sessionKeys) {
    const doc = loadReportDocument(sessionKey, reportsDir);
    if (!doc?.boys?.length) continue;
    loadedDays += 1;
    for (const boy of doc.boys) {
      const normalized = normalizeReportBoy(boy);
      if (!boys[normalized.boyId]) {
        boys[normalized.boyId] = {
          boyId: normalized.boyId,
          name: normalized.name,
          onlineMinutes: 0,
          waitingMinutes: 0,
          inCallMinutes: 0,
          daysPresent: 0,
        };
      }
      const target = boys[normalized.boyId];
      target.name = normalized.name;
      target.onlineMinutes += normalized.onlineMinutes;
      target.waitingMinutes += normalized.waitingMinutes;
      target.inCallMinutes += normalized.inCallMinutes;
      target.daysPresent += 1;
    }
  }

  const weekStart = sessionKeys[0];
  const weekEnd = sessionKeys.at(-1);
  const ranked = Object.values(boys)
    .map((boy) => ({
      ...boy,
      onlineDuration: formatDurationMinutes(boy.onlineMinutes),
      waitingDuration: formatDurationMinutes(boy.waitingMinutes),
      inCallDuration: formatDurationMinutes(boy.inCallMinutes),
    }))
    .sort(
      (a, b) =>
        b.onlineMinutes - a.onlineMinutes ||
        a.name.localeCompare(b.name, "ja")
    );

  const totalOnlineMinutes = ranked.reduce((sum, b) => sum + b.onlineMinutes, 0);
  const totalWaitingMinutes = ranked.reduce((sum, b) => sum + b.waitingMinutes, 0);
  const totalInCallMinutes = ranked.reduce((sum, b) => sum + b.inCallMinutes, 0);

  return {
    weekStart,
    weekEnd,
    weekKey: `${weekStart}_${weekEnd}`,
    loadedDays,
    sessionKeys,
    onlineCount: ranked.length,
    totalOnlineMinutes,
    totalWaitingMinutes,
    totalInCallMinutes,
    boys: ranked,
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildWeeklyReportCsv(report) {
  const lines = [
    "week_start,week_end,store_name,shop_id,period,generated_at,boy_id,name,online_minutes,waiting_minutes,in_call_minutes,days_present",
  ];
  for (const boy of report.boys) {
    lines.push(
      [
        escapeCsv(report.weekStart),
        escapeCsv(report.weekEnd),
        escapeCsv(report.storeName),
        escapeCsv(report.shopId),
        escapeCsv(report.period.label),
        escapeCsv(report.generatedAt),
        escapeCsv(boy.boyId),
        escapeCsv(boy.name),
        boy.onlineMinutes,
        boy.waitingMinutes,
        boy.inCallMinutes,
        boy.daysPresent,
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function updateWeeklyIndex(report, jsonPath, csvPath, reportsDir = REPORTS_DIR) {
  const indexPath = path.join(reportsDir, "weekly-index.json");
  /** @type {Array<object>} */
  let index = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      if (!Array.isArray(index)) index = [];
    } catch {
      index = [];
    }
  }

  const entry = {
    weekKey: report.weekKey,
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    period: report.period.label,
    generatedAt: report.generatedAt,
    onlineCount: report.onlineCount,
    totalOnlineMinutes: report.totalOnlineMinutes,
    jsonFile: path.basename(jsonPath),
    csvFile: path.basename(csvPath),
    kind: "weekly",
  };

  const existing = index.findIndex((item) => item.weekKey === report.weekKey);
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);
  index.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
}

export function saveWeeklyReportFiles(config, weeklyStats, generatedAt = new Date(), reportsDir = REPORTS_DIR) {
  ensureWeeklyReportsDir(reportsDir);
  const settings = config.settings || {};

  const report = {
    ...weeklyStats,
    storeName: config.storeName,
    shopId: config.shopId,
    period: {
      label: formatWeekPeriod(weeklyStats.weekStart, weeklyStats.weekEnd, settings),
    },
    generatedAt: generatedAt.toISOString(),
    totalOnlineDuration: formatDurationMinutes(weeklyStats.totalOnlineMinutes),
    totalWaitingDuration: formatDurationMinutes(weeklyStats.totalWaitingMinutes),
    totalInCallDuration: formatDurationMinutes(weeklyStats.totalInCallMinutes),
  };

  const jsonPath = path.join(reportsDir, `weekly-${report.weekKey}.json`);
  const csvPath = path.join(reportsDir, `weekly-${report.weekKey}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(csvPath, buildWeeklyReportCsv(report), "utf8");
  updateWeeklyIndex(report, jsonPath, csvPath, reportsDir);

  console.log(
    `[weekly-report] ファイル保存: ${path.basename(jsonPath)}, ${path.basename(csvPath)}`
  );
  return { jsonPath, csvPath, report };
}

export function shouldSendWeeklySummaryNow(date = new Date(), settings = {}) {
  if (settings.weeklySummaryEnabled === false) return false;
  if (!shouldSendDailySummaryNow(date, settings)) return false;
  const endedSessionKey = getEndedSessionKey(date, settings);
  if (!endedSessionKey) return false;
  return isSundaySessionKey(endedSessionKey);
}

export async function maybeSendWeeklySummary(client, getConfig, persistConfig, now = new Date()) {
  const config = getConfig();
  const settings = config.settings || {};
  if (!shouldSendWeeklySummaryNow(now, settings)) return;

  const weekEnd = getEndedSessionKey(now, settings);
  if (!weekEnd) return;

  const sessionKeys = getWeekSessionKeys(weekEnd);
  const weekKey = `${sessionKeys[0]}_${weekEnd}`;
  if (config.lastWeeklySummaryWeekKey === weekKey) return;

  const weeklyStats = aggregateWeeklyFromDailyReports(sessionKeys);
  if (weeklyStats.loadedDays === 0) {
    console.warn(`[weekly-report] 日次レポートが無いためスキップ (${weekKey})`);
    return;
  }

  await sendWeeklySummaryNotification(client, config, weeklyStats);
  const saved = saveWeeklyReportFiles(config, weeklyStats, now);
  addHistory(config, {
    type: "weekly_summary",
    weekKey,
    weekStart: weeklyStats.weekStart,
    weekEnd: weeklyStats.weekEnd,
    onlineCount: weeklyStats.onlineCount,
    reportJson: path.basename(saved.jsonPath),
    reportCsv: path.basename(saved.csvPath),
  });

  config.lastWeeklySummaryWeekKey = weekKey;
  persistConfig();
}

export async function sendWeeklySummaryNotification(client, config, weeklyStats) {
  const channelId = config.notifyChannelId;
  if (!channelId) {
    console.warn("[weekly-report] notifyChannelId 未設定のためスキップ");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const embed = buildWeeklySummaryEmbed(config, weeklyStats);
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    console.log(`[weekly-report] 週次サマリー送信 (${weeklyStats.weekKey})`);
  } catch (err) {
    console.error("[weekly-report] 送信エラー:", err.message);
  }
}

export function listWeeklyReportFiles(reportsDir = REPORTS_DIR) {
  const indexPath = path.join(reportsDir, "weekly-index.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return Array.isArray(index) ? index : [];
  } catch {
    return [];
  }
}

export { isSundaySessionKey, getWeekSessionKeys };
