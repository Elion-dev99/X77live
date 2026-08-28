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

function updateReportsIndex(
  report,
  jsonPath,
  csvPath,
  reportsDir = REPORTS_DIR,
  options = {}
) {
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
    interim: Boolean(report.interim),
    kind: options.kind || (report.interim ? "interim" : "final"),
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
  reportsDir = REPORTS_DIR,
  options = {}
) {
  ensureReportsDir(reportsDir);

  const report = buildDailyReportDocument(config, stats, generatedAt);
  if (options.interim) {
    report.interim = true;
    report.note =
      options.kind === "backup"
        ? "営業途中の自動バックアップです。確定版は営業終了後 01:00 に上書き保存されます。"
        : "営業途中の暫定レポートです。確定版は営業終了後 01:00 に data/reports/ へ保存されます。";
  }
  const jsonPath = path.join(reportsDir, `${report.sessionKey}.json`);
  const csvPath = path.join(reportsDir, `${report.sessionKey}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(csvPath, buildDailyReportCsv(report), "utf8");
  updateReportsIndex(report, jsonPath, csvPath, reportsDir, options);

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

export const SESSION_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSessionKey(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!SESSION_KEY_RE.test(trimmed)) return null;
  return trimmed;
}

export function getLatestSessionKey(reportsDir = REPORTS_DIR) {
  const list = listDailyReportFiles(reportsDir);
  return list.at(-1)?.sessionKey || null;
}

function resolveReportPath(reportsDir, sessionKey, ext) {
  if (!normalizeSessionKey(sessionKey)) return null;
  const filePath = path.resolve(reportsDir, `${sessionKey}.${ext}`);
  if (!filePath.startsWith(path.resolve(reportsDir) + path.sep)) {
    return null;
  }
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * @param {"json"|"csv"|"both"} format
 * @returns {{ sessionKey: string, files: Array<{ path: string, name: string }> } | null}
 */
export function resolveReportDownload(sessionKey, format = "both", reportsDir = REPORTS_DIR) {
  const key = normalizeSessionKey(sessionKey);
  if (!key) return null;

  /** @type {Array<{ path: string, name: string }>} */
  const files = [];

  if (format === "json" || format === "both") {
    const jsonPath = resolveReportPath(reportsDir, key, "json");
    if (jsonPath) files.push({ path: jsonPath, name: `${key}.json` });
  }
  if (format === "csv" || format === "both") {
    const csvPath = resolveReportPath(reportsDir, key, "csv");
    if (csvPath) files.push({ path: csvPath, name: `${key}.csv` });
  }

  if (files.length === 0) return null;
  return { sessionKey: key, files };
}

export function loadReportDocument(sessionKey, reportsDir = REPORTS_DIR) {
  const jsonPath = resolveReportPath(reportsDir, sessionKey, "json");
  if (!jsonPath) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 営業途中の暫定レポート（ファイル保存せずメモリ上で生成）
 * @param {"json"|"csv"|"both"} format
 */
export function buildInterimReportFiles(config, stats, format = "both", generatedAt = new Date()) {
  const report = buildDailyReportDocument(config, stats, generatedAt);
  report.interim = true;
  report.note =
    "営業途中の暫定レポートです。確定版は営業終了後 01:00 に data/reports/ へ保存されます。";

  /** @type {Array<{ name: string, content: string }>} */
  const files = [];

  if (format === "json" || format === "both") {
    files.push({
      name: `${stats.sessionKey}-interim.json`,
      content: JSON.stringify(report, null, 2),
    });
  }
  if (format === "csv" || format === "both") {
    files.push({
      name: `${stats.sessionKey}-interim.csv`,
      content: buildDailyReportCsv(report),
    });
  }

  return { report, files };
}
