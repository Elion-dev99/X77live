import { addHistory } from "./store.js";
import {
  sendScrapeFailureAlert,
  sendScrapeRecoveryNotification,
} from "./notifier.js";

function defaultScrapeHealth() {
  return {
    consecutiveFailures: 0,
    lastFailureAt: null,
    lastError: null,
    alertSent: false,
    lastSuccessAt: null,
  };
}

export function ensureScrapeHealth(config) {
  if (!config.scrapeHealth || typeof config.scrapeHealth !== "object") {
    config.scrapeHealth = defaultScrapeHealth();
  }
  return config.scrapeHealth;
}

function getAlertThreshold(config) {
  const settings = config.settings || {};
  const threshold = Number(settings.scrapeAlertThreshold);
  if (!Number.isFinite(threshold) || threshold < 1) return 3;
  return Math.floor(threshold);
}

/**
 * @param {object} config
 * @param {import('discord.js').Client|null} client
 * @param {() => void} persistConfig
 */
export async function handleScrapeSuccess(config, client, persistConfig) {
  const health = ensureScrapeHealth(config);
  const hadFailures = health.consecutiveFailures > 0 || health.alertSent;

  if (hadFailures && client && config.settings?.scrapeAlertEnabled !== false) {
    await sendScrapeRecoveryNotification(client, config, health.consecutiveFailures);
    addHistory(config, {
      type: "scrape_recovered",
      previousFailures: health.consecutiveFailures,
    });
  }

  config.scrapeHealth = {
    ...defaultScrapeHealth(),
    lastSuccessAt: new Date().toISOString(),
  };
  persistConfig();
}

/**
 * @param {object} config
 * @param {import('discord.js').Client|null} client
 * @param {() => void} persistConfig
 * @param {Error|{ message?: string }} err
 */
export async function handleScrapeFailure(config, client, persistConfig, err) {
  const health = ensureScrapeHealth(config);
  const message = err?.message || String(err);

  health.consecutiveFailures += 1;
  health.lastFailureAt = new Date().toISOString();
  health.lastError = message;

  addHistory(config, {
    type: "scrape_failure",
    consecutiveFailures: health.consecutiveFailures,
    error: message,
  });

  const threshold = getAlertThreshold(config);
  const shouldAlert =
    config.settings?.scrapeAlertEnabled !== false &&
    health.consecutiveFailures >= threshold &&
    !health.alertSent;

  if (shouldAlert && client) {
    await sendScrapeFailureAlert(client, config, health);
    health.alertSent = true;
    addHistory(config, {
      type: "scrape_alert",
      consecutiveFailures: health.consecutiveFailures,
      error: message,
    });
  }

  persistConfig();
}
