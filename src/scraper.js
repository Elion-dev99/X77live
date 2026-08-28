/**
 * x77.jp / dgdgdg.com から大阪店ボーイの稼働状況を取得
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const LIVER_LIST_BASE =
  "https://x77.jp/live/twoshot_liverlist.php?search_tribe=1&search_group_id=2";
const AGE_VERIFY_URL = "https://x77.jp/?mode=1";
const ROSTER_URL = "https://www.dgdgdg.com/boy/list.php";
const LIVER_LIST_PAGE_SIZE = 50;

/** @type {Map<string, string>} */
const sessionCookies = new Map();

/** @type {number} */
let lastCookieRefresh = 0;

const COOKIE_TTL_MS = 30 * 60 * 1000;
const REQUIRED_COOKIES = ["X_LIVE_SERVICE", "view_mode", "live_lang"];

export const STATUS = {
  WAITING: "待機中",
  IN_CALL: "通話中",
  OFFLINE: "オフライン",
};

/**
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function fetchPage(url, options = {}) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ja,en;q=0.9",
    ...(options.headers || {}),
  };

  if (sessionCookies.size > 0) {
    headers.Cookie = [...sessionCookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  const res = await fetch(url, {
    ...options,
    headers,
    redirect: "follow",
  });

  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const part = c.split(";")[0];
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (REQUIRED_COOKIES.includes(name) || name === "X_LIVE_SERVICE") {
      sessionCookies.set(name, value);
      lastCookieRefresh = Date.now();
    }
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return res.text();
}

async function ensureSession() {
  const hasViewMode = sessionCookies.has("view_mode");
  if (
    hasViewMode &&
    sessionCookies.has("X_LIVE_SERVICE") &&
    Date.now() - lastCookieRefresh < COOKIE_TTL_MS
  ) {
    return;
  }

  // 年齢確認: リダイレクトを追わず view_mode Cookie を取得
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ja,en;q=0.9",
  };
  if (sessionCookies.size > 0) {
    headers.Cookie = [...sessionCookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  const res = await fetch(
    `${AGE_VERIFY_URL}&ref=${encodeURIComponent(LIVER_LIST_BASE)}`,
    { headers, redirect: "manual" }
  );

  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const part = c.split(";")[0];
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    sessionCookies.set(part.slice(0, eq), part.slice(eq + 1));
  }
  lastCookieRefresh = Date.now();
}

/**
 * @param {string} html
 * @returns {number}
 */
export function parseLiverListTotal(html) {
  const match = html.match(/全(\d+)件中/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * @param {number} [pageNo]
 * @returns {string}
 */
export function buildLiverListUrl(pageNo = 1) {
  const url = new URL(LIVER_LIST_BASE);
  url.searchParams.set("search_page_max", String(LIVER_LIST_PAGE_SIZE));
  if (pageNo > 1) {
    url.searchParams.set("search_pageno", String(pageNo));
  }
  return url.toString();
}

/**
 * twoshot_liverlist.php から待機中・通話中・オフラインを判定
 * @param {string} html
 * @returns {Map<string, { boyId: string, name: string, status: string }>}
 */
export function parseLivePage(html) {
  /** @type {Map<string, { boyId: string, name: string, status: string }>} */
  const statuses = new Map();

  const blocks = html.match(/<li>[\s\S]*?<\/li>/g) || [];
  for (const block of blocks) {
    const idMatch = block.match(/boy_id=(\d+)/);
    if (!idMatch) continue;

    const boyId = idMatch[1];
    const nameMatch = block.match(/<div class="liveinfo">[\s\S]*?<p>\s*([^<\n]+)/);
    const name = nameMatch ? nameMatch[1].trim() : "不明";

    let status = STATUS.OFFLINE;
    if (block.includes("live_situation01")) {
      status = STATUS.IN_CALL;
    } else if (block.includes("live_situation02")) {
      const textMatch = block.match(
        /live_situation02">\s*(?:<a[^>]*>\s*)?([^<\n]+)/
      );
      const label = textMatch ? textMatch[1].trim() : STATUS.WAITING;
      status = label.includes("通話") ? STATUS.IN_CALL : STATUS.WAITING;
    }

    statuses.set(boyId, { boyId, name, status });
  }

  return statuses;
}

/**
 * @param {string} html
 * @returns {Map<string, { boyId: string, name: string }>}
 */
export function parseRosterPage(html) {
  /** @type {Map<string, { boyId: string, name: string }>} */
  const roster = new Map();

  for (const m of html.matchAll(/boy_id=(\d+)/g)) {
    roster.set(m[1], { boyId: m[1], name: null });
  }

  for (const m of html.matchAll(
    /boy_id=(\d+)[\s\S]{0,600}?class="boy_name">([^<]+)</g
  )) {
    roster.set(m[1], { boyId: m[1], name: m[2].trim() });
  }

  for (const m of html.matchAll(
    /boy_id=(\d+)[\s\S]{0,400}?alt="([^"]+)"/g
  )) {
    const existing = roster.get(m[1]);
    if (existing && !existing.name) {
      existing.name = m[2].trim();
    } else if (!existing) {
      roster.set(m[1], { boyId: m[1], name: m[2].trim() });
    }
  }

  return roster;
}

/**
 * @param {Map<string, { boyId: string, name: string }>} roster
 * @param {Map<string, { boyId: string, name: string, status: string }>} online
 * @returns {Array<{ boyId: string, name: string, status: string, liveName?: string }>}
 */
export function mergeOsakaStatuses(roster, online) {
  const result = [];

  for (const [boyId, boy] of roster) {
    const live = online.get(boyId);
    result.push({
      boyId,
      name: boy.name || live?.name || `ID:${boyId}`,
      liveName: live?.name,
      status: live ? live.status : STATUS.OFFLINE,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/**
 * @param {string} shopId
 */
export async function fetchRoster(shopId) {
  const html = await fetchPage(`${ROSTER_URL}?shop_id=${shopId}`);
  return parseRosterPage(html);
}

async function fetchLiverListHtml(pageNo = 1) {
  return fetchPage(buildLiverListUrl(pageNo));
}

export async function fetchLiveOnline() {
  await ensureSession();
  let html = await fetchLiverListHtml(1);

  if (html.includes("年齢認証") && !html.includes("fvliver_list_top")) {
    sessionCookies.clear();
    await ensureSession();
    html = await fetchLiverListHtml(1);
  }

  const statuses = parseLivePage(html);
  const total = parseLiverListTotal(html);
  const totalPages = Math.max(1, Math.ceil(total / LIVER_LIST_PAGE_SIZE));

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const pageHtml = await fetchLiverListHtml(pageNo);
    for (const [boyId, boy] of parseLivePage(pageHtml)) {
      statuses.set(boyId, boy);
    }
  }

  return statuses;
}

/**
 * @param {string} shopId
 * @param {Set<string>} [excludeIds]
 */
export async function scrapeOsakaStatuses(shopId, excludeIds = new Set()) {
  const [roster, online] = await Promise.all([
    fetchRoster(shopId),
    fetchLiveOnline(),
  ]);

  let statuses = mergeOsakaStatuses(roster, online);
  if (excludeIds.size > 0) {
    statuses = statuses.filter((b) => !excludeIds.has(b.boyId));
  }

  const summary = {
    total: statuses.length,
    waiting: statuses.filter((b) => b.status === STATUS.WAITING).length,
    inCall: statuses.filter((b) => b.status === STATUS.IN_CALL).length,
    offline: statuses.filter((b) => b.status === STATUS.OFFLINE).length,
  };

  return { roster, online, statuses, summary, scrapedAt: new Date().toISOString() };
}
