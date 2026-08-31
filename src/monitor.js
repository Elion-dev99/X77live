import { scrapeOsakaStatuses, STATUS } from "./scraper.js";
import { addHistory, saveConfig } from "./store.js";
import { sendStatusChangeNotification, sendNewBoyNotification } from "./notifier.js";
import { buildBoyStatusChangeMessage, isOnlineStatus } from "./format.js";
import { tickDailyStats } from "./daily-stats.js";
import { handleScrapeSuccess, handleScrapeFailure } from "./scrape-health.js";
import { markBotLivenessHealthy } from "./bot-liveness.js";
import { runShiftCheck } from "./shift-monitor.js";
import { shouldRunScheduledMonitoring } from "./business-hours.js";

/** @type {ReturnType<typeof setInterval>|null} */
let pollHandle = null;

/** @type {import('discord.js').Client|null} */
let clientRef = null;

/** @type {(() => object)|null} */
let getConfigFn = null;

/** @type {(() => void)|null} */
let persistConfigFn = null;

/**
 * @param {object} config
 * @param {Array<{ boyId: string, name: string, status: string }>} statuses
 */
function detectChanges(config, statuses) {
  /** @type {Array<{ boyId: string, name: string, from: string, to: string }>} */
  const changes = [];
  const prev = config.boyStatuses || {};

  for (const boy of statuses) {
    const oldStatus = prev[boy.boyId]?.status;
    if (oldStatus && oldStatus !== boy.status) {
      changes.push({
        boyId: boy.boyId,
        name: boy.name,
        from: oldStatus,
        to: boy.status,
      });
    }
  }

  return changes;
}

/**
 * @param {object} config
 * @param {Map<string, { name: string }>} roster
 */
function detectNewBoys(config, roster) {
  const hadRoster = Object.keys(config.boys || {}).length > 0;
  if (!hadRoster || !config.lastScrapeAt) return [];

  /** @type {Array<{ boyId: string, name: string }>} */
  const newBoys = [];
  for (const [boyId, info] of roster) {
    if (!config.boys[boyId]) {
      newBoys.push({ boyId, name: info.name });
    }
  }
  return newBoys;
}

/**
 * @param {object} config
 * @param {Awaited<ReturnType<typeof scrapeOsakaStatuses>>} data
 */
function applyScrapeResult(config, data) {
  config.boys = config.boys || {};
  config.boyStatuses = config.boyStatuses || {};

  for (const [boyId, info] of data.roster) {
    if (!config.boys[boyId]) {
      config.boys[boyId] = {
        name: info.name,
        excluded: false,
        addedAt: new Date().toISOString(),
      };
    } else if (info.name && !config.boys[boyId].name) {
      config.boys[boyId].name = info.name;
    }
  }

  const excludeIds = new Set(
    Object.entries(config.boys)
      .filter(([, b]) => b.excluded)
      .map(([id]) => id)
  );

  const filtered = data.statuses.filter((b) => !excludeIds.has(b.boyId));

  for (const boy of filtered) {
    config.boyStatuses[boy.boyId] = {
      name: boy.name,
      liveName: boy.liveName || null,
      status: boy.status,
      updatedAt: data.scrapedAt,
    };
  }

  const rosterIds = new Set(data.roster.keys());
  for (const boyId of Object.keys(config.boyStatuses)) {
    if (!rosterIds.has(boyId)) {
      delete config.boyStatuses[boyId];
    }
  }

  config.lastScrapeAt = data.scrapedAt;
  config.lastSummary = {
    ...data.summary,
    total: filtered.length,
    waiting: filtered.filter((b) => b.status === STATUS.WAITING).length,
    inCall: filtered.filter((b) => b.status === STATUS.IN_CALL).length,
    offline: filtered.filter((b) => b.status === STATUS.OFFLINE).length,
  };

  return filtered;
}

export async function runScrape(getConfig, persistConfig, client = null, options = {}) {
  const config = getConfig();
  const settings = config.settings || {};
  const now = options.now || new Date();

  if (
    !options.force &&
    !shouldRunScheduledMonitoring(now, settings)
  ) {
    console.log("[monitor] 営業時間外のためスクレイプをスキップ");
    return { skipped: true, reason: "outside_business_hours" };
  }

  const shopId = config.shopId || "4";

  const excludeIds = new Set(
    Object.entries(config.boys || {})
      .filter(([, b]) => b.excluded)
      .map(([id]) => id)
  );

  try {
    const data = await scrapeOsakaStatuses(shopId, excludeIds);
    const prevBoys = config.boys || {};
    const prevStatuses = { ...(config.boyStatuses || {}) };

    if (data.roster.size === 0 && data.online.size === 0 && Object.keys(prevBoys).length > 0) {
      console.warn("[monitor] 取得データが空のため、前回の正常データを保持します");
      return { skipped: true, reason: "empty_scrape_result", previous: config.lastScrapeAt || null };
    }

    const newBoys = detectNewBoys(config, data.roster);
    const statuses = applyScrapeResult(config, data);
    const changes = detectChanges({ boyStatuses: prevStatuses }, statuses);

    tickDailyStats(config, statuses);

    for (const change of changes) {
      addHistory(config, {
        type: "status_change",
        boyId: change.boyId,
        name: change.name,
        from: change.from,
        to: change.to,
      });
    }

    persistConfig();

    if (client && newBoys.length > 0 && config.settings.pingOnNewBoy !== false) {
      for (const boy of newBoys) {
        addHistory(config, {
          type: "boy_new",
          boyId: boy.boyId,
          name: boy.name,
        });
        await sendNewBoyNotification(client, config, boy);
      }
      persistConfig();
    }

    if (client && config.settings.pingOnStatusChange && changes.length > 0) {
      for (const change of changes) {
        if (!isOnlineStatus(change.to)) continue;
        const msg = buildBoyStatusChangeMessage(change);
        await sendStatusChangeNotification(client, config, msg);
      }
    }

    await handleScrapeSuccess(config, client, persistConfig);
    markBotLivenessHealthy(config);

    try {
      await runShiftCheck(config, statuses, client);
    } catch (err) {
      console.error("[shift] 照合エラー:", err.message);
    }

    persistConfig();

    console.log(
      `[monitor] スクレイプ完了: 待機${config.lastSummary.waiting} / 通話${config.lastSummary.inCall} / オフライン${config.lastSummary.offline}`
    );

    return { statuses, changes, summary: config.lastSummary };
  } catch (err) {
    await handleScrapeFailure(config, client, persistConfig, err);
    console.error("[monitor] スクレイプ失敗:", err.message);
    return { error: err.message };
  }
}

export function startMonitor(client, getConfig, persistConfig) {
  stopMonitor();
  clientRef = client;
  getConfigFn = getConfig;
  persistConfigFn = persistConfig;

  const config = getConfig();
  const intervalMs = (config.pollIntervalMinutes || 2) * 60 * 1000;

  console.log(`[monitor] 監視開始: ${config.pollIntervalMinutes || 2}分間隔`);

  runScrape(getConfig, persistConfig, client).catch((err) => {
    console.error("[monitor] 初回スクレイプ失敗:", err.message);
  });

  pollHandle = setInterval(() => {
    runScrape(getConfig, persistConfig, client).catch((err) => {
      console.error("[monitor] スクレイプ失敗:", err.message);
    });
  }, intervalMs);
}

export function stopMonitor() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
    console.log("[monitor] 監視停止");
  }
}

export function restartMonitor(client, getConfig, persistConfig) {
  stopMonitor();
  startMonitor(client, getConfig, persistConfig);
}

export { STATUS };
