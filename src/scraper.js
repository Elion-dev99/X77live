/**
 * x77.jp / dgdgdg.com から大阪店ボーイの稼働状況を取得
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const LIVE_URL = "https://x77.jp/live/?mode=online";
const AGE_VERIFY_URL = "https://x77.jp/?mode=1";
const ROSTER_URL = "https://www.dgdgdg.com/boy/list.php";

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
    `${AGE_VERIFY_URL}&ref=${encodeURIComponent(LIVE_URL)}`,
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
 * @returns {Map<string, { boyId: string, name: string, status: string }>}
 */
export function parseLivePage(html) {
  /** @type {Map<string, { boyId: string, name: string, status: string }>} */
  const online = new Map();

  const blocks = html.match(/<li>[\s\S]*?<\/li>/g) || [];
  for (const block of blocks) {
    const idMatch = block.match(/boy_id=(\d+)/);
    if (!idMatch) continue;

    const boyId = idMatch[1];
    const nameMatch = block.match(/<div class="liveinfo">[\s\S]*?<p>\s*([^<\n]+)/);
    const name = nameMatch ? nameMatch[1].trim() : "不明";

    let status = STATUS.WAITING;
    if (block.includes("live_situation01")) {
      status = STATUS.IN_CALL;
    } else if (block.includes("live_situation02")) {
      const textMatch = block.match(
        /live_situation02">\s*(?:<a[^>]*>\s*)?([^<\n]+)/
      );
      status = textMatch ? textMatch[1].trim() : STATUS.WAITING;
    } else {
      continue;
    }

    online.set(boyId, { boyId, name, status });
  }

  return online;
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

export async function fetchLiveOnline() {
  await ensureSession();
  const html = await fetchPage(LIVE_URL);

  if (html.includes("年齢認証") && !html.includes("liver_list")) {
    sessionCookies.clear();
    await ensureSession();
    const retryHtml = await fetchPage(LIVE_URL);
    return parseLivePage(retryHtml);
  }

  return parseLivePage(html);
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
