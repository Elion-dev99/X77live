/**
 * dgdgdg.com ボーイシフト取得・EX JSON 連携
 */

import { formatDateKey, getJstParts } from "./business-hours.js";

const ROSTER_FETCH = globalThis.fetch;
const SHIFT_URL = "https://www.dgdgdg.com/boy/shift.php";
/** @see https://github.com/Elion-dev99/EX */
export const DEFAULT_EX_SHIFT_URL =
  "https://ex-shift.elion-dev08.workers.dev/api/shop/schedule?shop_id=4";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * @param {string} dateLabel e.g. "8/29"
 * @param {number} [year]
 */
export function dateLabelToKey(dateLabel, year = new Date().getFullYear()) {
  const [month, day] = dateLabel.split("/").map(Number);
  if (!month || !day) return null;
  return formatDateKey({ year, month, day });
}

/**
 * @param {string} sectionHtml
 */
export function parseShiftSection(sectionHtml) {
  /** @type {Array<{ boyId: string, name: string, shiftTime: string, night: boolean|null }>} */
  const boys = [];
  const seen = new Set();

  const blocks = sectionHtml.match(/<li>[\s\S]*?<\/li>/g) || [];
  for (const block of blocks) {
    const idMatch = block.match(/boy_id=(\d+)/);
    if (!idMatch) continue;
    const boyId = idMatch[1];
    if (seen.has(boyId)) continue;
    seen.add(boyId);

    const nameMatch = block.match(/boy_data_name"><span>([^<]+)/);
    const timeMatch = block.match(/class="time"[^>]*><i><\/i>([^<]+)/);
    const nightMatch = block.match(/class="night">NIGHT ([○×])</);

    boys.push({
      boyId,
      name: nameMatch ? nameMatch[1].trim() : `ID:${boyId}`,
      shiftTime: timeMatch ? timeMatch[1].trim() : "要問合せ",
      night:
        nightMatch?.[1] === "○" ? true : nightMatch?.[1] === "×" ? false : null,
    });
  }

  return boys;
}

/**
 * @param {string} html
 * @param {number} [year]
 */
export function parseShiftPage(html, year = new Date().getFullYear()) {
  /** @type {Array<{ dateLabel: string, dateKey: string, boys: ReturnType<typeof parseShiftSection> }>} */
  const days = [];
  const parts = html.split(
    /<h2><span>([\d]+\/[\d]+)\([^)]+\)<\/span>の出勤ボーイ情報<\/h2>/
  );

  for (let i = 1; i < parts.length; i += 2) {
    const dateLabel = parts[i];
    const dateKey = dateLabelToKey(dateLabel, year);
    if (!dateKey) continue;
    days.push({
      dateLabel,
      dateKey,
      boys: parseShiftSection(parts[i + 1] || ""),
    });
  }

  return days;
}

export function getTodayDateKey(now = new Date()) {
  const { year, month, day } = getJstParts(now);
  return formatDateKey({ year, month, day });
}

export function findShiftDay(days, dateKey) {
  return days.find((day) => day.dateKey === dateKey) || null;
}

async function fetchShiftHtml(shopId) {
  const res = await ROSTER_FETCH(`${SHIFT_URL}?shop_id=${shopId}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`シフトページ HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * EX / 手動 export の1ボーイ行を正規化
 * @param {object} boy
 */
export function normalizeExShiftBoy(boy) {
  const boyId = String(boy.boyId || boy.id || "").trim();
  if (!boyId) return null;

  let shiftTime = boy.shiftTime || boy.timeText || null;
  if (!shiftTime && boy.start) {
    shiftTime = boy.end ? `${boy.start}～${boy.end}` : `${boy.start}～LAST`;
  }

  return {
    boyId,
    name: boy.name || `ID:${boyId}`,
    shiftTime: shiftTime || "要問合せ",
    night: boy.night ?? null,
  };
}

/**
 * EX アプリ等から export した JSON
 * - 手動 export: { date, boys: [{ boyId, name, start?, end?, shiftTime? }] }
 * - EX API: { days: [{ date, boys: [{ boyId, name, timeText? }] }] }
 */
export function normalizeExShiftDocument(raw, dateKey) {
  if (!raw || typeof raw !== "object") return null;

  const docDate = raw.date || raw.dateKey || raw.sessionKey || dateKey;
  const sourceBoys = Array.isArray(raw.boys)
    ? raw.boys
    : Array.isArray(raw.scheduled)
      ? raw.scheduled
      : [];

  const boys = sourceBoys.map(normalizeExShiftBoy).filter(Boolean);

  return { dateKey: docDate, boys };
}

/**
 * EX shop schedule API 等のレスポンスから指定日を抽出
 * @param {object|Array} raw
 * @param {string} dateKey
 */
export function extractExShiftDay(raw, dateKey) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return (
      raw.find((item) => item.date === dateKey || item.dateKey === dateKey) ||
      null
    );
  }
  if (raw.days && Array.isArray(raw.days)) {
    return (
      raw.days.find(
        (item) => item.date === dateKey || item.dateKey === dateKey
      ) || null
    );
  }
  if (Array.isArray(raw.boys) || Array.isArray(raw.scheduled)) {
    return raw;
  }
  return null;
}

async function loadShiftFromExUrl(url, dateKey) {
  const res = await ROSTER_FETCH(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`EXシフト JSON HTTP ${res.status}`);
  }
  const raw = await res.json();
  const day = extractExShiftDay(raw, dateKey);
  return day ? normalizeExShiftDocument(day, dateKey) : null;
}

function resolveExShiftUrl(config) {
  const fromEnv = process.env.EX_SHIFT_JSON_URL?.trim();
  if (fromEnv) return fromEnv;
  if (config.settings?.exShiftJsonUrl?.trim()) {
    return config.settings.exShiftJsonUrl.trim();
  }
  return DEFAULT_EX_SHIFT_URL;
}

/**
 * @returns {{ dateKey: string, boys: Array<object>, source: string }}
 */
export async function fetchTodayShift(config, now = new Date()) {
  const shopId = config.shopId || "4";
  const dateKey = getTodayDateKey(now);
  const exUrl = resolveExShiftUrl(config);
  const exDisabled = process.env.EX_SHIFT_ENABLED === "false";

  if (exUrl && !exDisabled) {
    try {
      const fromEx = await loadShiftFromExUrl(exUrl, dateKey);
      if (fromEx?.boys?.length) {
        return {
          ...fromEx,
          source: exUrl === DEFAULT_EX_SHIFT_URL ? "ex-api" : "ex-json",
        };
      }
    } catch (err) {
      console.warn("[shift] EX シフト取得失敗、dgdgdg にフォールバック:", err.message);
    }
  }

  const html = await fetchShiftHtml(shopId);
  const { year } = getJstParts(now);
  const days = parseShiftPage(html, year);
  const today = findShiftDay(days, dateKey);
  return {
    dateKey,
    boys: today?.boys || [],
    source: "dgdgdg",
  };
}
