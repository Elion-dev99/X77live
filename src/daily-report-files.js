import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";
import { formatDurationMinutes, formatSessionPeriod } from "./business-hours.js";

export const REPORTS_DIR = path.join(DATA_DIR, "reports");

function ensureReportsDir(dir = REPORTS_DIR) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {object} config
 * @param {{ sessionKey: string, boys: Record<string, { name: string, onlineMinutes: number }> }} stats
 * @param {Date} [generatedAt]
 */
export function buildDailyReportDocument(config, stats, generatedAt = new Date()) {
  const settings = config.settings || {};
  const boys = Object.entries(stats.boys || {})
    .map(([boyId, info]) => ({
      boyId,
      name: info.name,
      onlineMinutes: Math.round(info.onlineMinutes || 0),
      onlineDuration: formatDurationMinutes(info.onlineMinutes || 0),
    }))
    .sort(
      (a, b) =>
        b.onlineMinutes - a.onlineMinutes ||
        a.name.localeCompare(b.name, "ja")
    );

  const totalOnlineMinutes = boys.reduce((sum, b) => sum + b.onlineMinutes, 0);

  return {
    sessionKey: stats.sessionKey,
    storeName: config.storeName,
    shopId: config.shopId,
    period: {
      open: settings.businessHoursOpen || "13:00",
      close: settings.businessHoursClose || "01:00",
      label: formatSessionPeriod(stats.sessionKey, settings),
    },
    generatedAt: generatedAt.toISOString(),
    onlineCount: boys.length,
    totalOnlineMinutes,
    totalOnlineDuration: formatDurationMinutes(totalOnlineMinutes),
    boys,
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildDailyReportCsv(report) {
  const lines = [
    "session_key,store_name,shop_id,period,generated_at,boy_id,name,online_minutes,online_duration",
  ];

  for (const boy of report.boys) {
    lines.push(
      [
        escapeCsv(report.sessionKey),
        escapeCsv(report.storeName),
        escapeCsv(report.shopId),
        escapeCsv(report.period.label),
        escapeCsv(report.generatedAt),
        escapeCsv(boy.boyId),
        escapeCsv(boy.name),
        boy.onlineMinutes,
        escapeCsv(boy.onlineDuration),
      ].join(",")
    );
  }

  if (report.boys.length === 0) {
    lines.push(
      [
        escapeCsv(report.sessionKey),
        escapeCsv(report.storeName),
        escapeCsv(report.shopId),
        escapeCsv(report.period.label),
        escapeCsv(report.generatedAt),
        "",
        "",
        0,
        "",
      ].join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

function updateReportsIndex(report, jsonPath, csvPath, reportsDir = REPORTS_DIR) {
  const indexPath = path.join(reportsDir, "index.json");
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
    sessionKey: report.sessionKey,
    storeName: report.storeName,
    period: report.period.label,
    generatedAt: report.generatedAt,
    onlineCount: report.onlineCount,
    totalOnlineMinutes: report.totalOnlineMinutes,
    jsonFile: path.basename(jsonPath),
    csvFile: path.basename(csvPath),
  };

  const existing = index.findIndex((item) => item.sessionKey === report.sessionKey);
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }

  index.sort((a, b) => a.sessionKey.localeCompare(b.sessionKey));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
}

/**
 * @returns {{ jsonPath: string, csvPath: string, report: object }}
 */
export function saveDailyReportFiles(
  config,
  stats,
  generatedAt = new Date(),
  reportsDir = REPORTS_DIR
) {
  ensureReportsDir(reportsDir);

  const report = buildDailyReportDocument(config, stats, generatedAt);
  const jsonPath = path.join(reportsDir, `${report.sessionKey}.json`);
  const csvPath = path.join(reportsDir, `${report.sessionKey}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(csvPath, buildDailyReportCsv(report), "utf8");
  updateReportsIndex(report, jsonPath, csvPath, reportsDir);

  console.log(
    `[daily-report] ファイル保存: ${path.basename(jsonPath)}, ${path.basename(csvPath)}`
  );

  return { jsonPath, csvPath, report };
}

export function listDailyReportFiles(reportsDir = REPORTS_DIR) {
  ensureReportsDir(reportsDir);
  const indexPath = path.join(reportsDir, "index.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return Array.isArray(index) ? index : [];
  } catch {
    return [];
  }
}
