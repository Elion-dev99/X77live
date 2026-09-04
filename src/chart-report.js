/**
 * 稼働ランキンググラフ（PNG）生成
 * Bot-Hosting 向けにネイティブ依存なし — QuickChart API を利用
 */

import { formatDurationMinutes, formatSessionPeriod } from "./business-hours.js";
import { getLogger } from "./logger.js";

const logger = getLogger("chart-report");

const DEFAULT_QUICKCHART_URL = "https://quickchart.io/chart";
const MAX_BARS = 15;

function getChartEndpoint() {
  return process.env.QUICKCHART_URL?.trim() || DEFAULT_QUICKCHART_URL;
}

/**
 * @param {{ name: string, onlineMinutes: number, waitingMinutes?: number, inCallMinutes?: number }[]} boys
 * @param {{ title: string, subtitle?: string }} meta
 */
export function buildDailyRankingChartConfig(boys, meta) {
  const top = boys.slice(0, MAX_BARS);
  const labels = top.map((b) => {
    const name = String(b.name || "?").slice(0, 12);
    const dur = formatDurationMinutes(b.onlineMinutes || 0);
    return `${name} (${dur})`;
  });
  const waiting = top.map((b) => Math.round(b.waitingMinutes || 0));
  const inCall = top.map((b) => Math.round(b.inCallMinutes || 0));

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "待機（分）",
          data: waiting,
          backgroundColor: "rgba(87, 242, 135, 0.85)",
          borderWidth: 0,
        },
        {
          label: "通話（分）",
          data: inCall,
          backgroundColor: "rgba(254, 231, 92, 0.9)",
          borderWidth: 0,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: meta.title,
          font: { size: 16, weight: "bold" },
          color: "#ffffff",
        },
        subtitle: meta.subtitle
          ? {
              display: true,
              text: meta.subtitle,
              color: "#b9bbbe",
              padding: { bottom: 8 },
            }
          : undefined,
        legend: {
          labels: { color: "#dcddde" },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: "#b9bbbe" },
          grid: { color: "rgba(255,255,255,0.08)" },
          title: {
            display: true,
            text: "分",
            color: "#b9bbbe",
          },
        },
        y: {
          stacked: true,
          ticks: { color: "#ffffff", font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  };
}

/**
 * @param {object} report buildDailyReportDocument の結果
 * @returns {{ chart: object, width: number, height: number, filename: string } | null}
 */
export function buildChartRequestFromReport(report) {
  const boys = (report.boys || []).filter((b) => (b.onlineMinutes || 0) > 0);
  if (boys.length === 0) return null;

  const period = report.period?.label || report.sessionKey;
  const chart = buildDailyRankingChartConfig(boys, {
    title: `${report.storeName || "大阪店"} 稼働ランキング`,
    subtitle: `${period} ／ 上位${Math.min(boys.length, MAX_BARS)}名`,
  });

  const height = Math.min(900, Math.max(360, Math.min(boys.length, MAX_BARS) * 42 + 120));

  return {
    chart,
    width: 900,
    height,
    filename: `ranking-${report.sessionKey}.png`,
  };
}

/**
 * QuickChart で PNG を取得
 * @param {{ chart: object, width: number, height: number }} request
 * @returns {Promise<Buffer>}
 */
export async function renderChartPng(request) {
  const endpoint = getChartEndpoint();
  const body = {
    width: request.width,
    height: request.height,
    backgroundColor: "#2b2d31",
    devicePixelRatio: 2,
    format: "png",
    chart: request.chart,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickChart HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {object} report
 * @returns {Promise<{ buffer: Buffer, filename: string } | null>}
 */
export async function renderDailyRankingChart(report) {
  const request = buildChartRequestFromReport(report);
  if (!request) {
    logger.info(`グラフ対象なし: session=${report.sessionKey}`);
    return null;
  }

  try {
    const buffer = await renderChartPng(request);
    logger.info(
      `グラフ生成完了: ${request.filename} (${buffer.length} bytes)`
    );
    return { buffer, filename: request.filename };
  } catch (err) {
    logger.error(`グラフ生成失敗: ${err.message}`, err);
    throw err;
  }
}

/**
 * DM 用キャプション
 * @param {object} report
 */
export function buildDailyChartDmCaption(report) {
  const period =
    report.period?.label ||
    formatSessionPeriod(report.sessionKey, {});
  const lines = [
    "📊 **本日の稼働サマリー（グラフ）**",
    "",
    `営業日: **${report.sessionKey}**`,
    `期間: ${period}`,
    `オンライン稼働: **${report.onlineCount ?? 0}** 名`,
    `合計: **${report.totalOnlineDuration || formatDurationMinutes(report.totalOnlineMinutes || 0)}**`,
    `（待機 ${report.totalWaitingDuration || "—"} / 通話 ${report.totalInCallDuration || "—"}）`,
  ];

  if ((report.onlineCount ?? 0) === 0) {
    lines.push("", "_本営業日はオンライン稼働の記録がありませんでした_");
  } else {
    lines.push("", "ランキング画像を添付しています。");
  }

  return lines.join("\n");
}
