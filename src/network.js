/**
 * ネットワーク操作用のユーティリティ
 * 自動リトライト・タイムアウト機能付き
 */

import { getLogger } from "./logger.js";

const logger = getLogger("network");

/**
 * リトライト設定
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
};

/**
 * 指数バックオフで遅延
 * @param {number} attempt - 試行番号（0から始まる）
 * @param {object} config
 * @returns {number} 遅延ミリ秒
 */
function calculateBackoffDelay(attempt, config) {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * ネットワークエラーが再試行可能か判定
 * @param {Error|Response} error
 * @returns {boolean}
 */
function isRetryableError(error) {
  // ネットワーク関連エラー
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("aborted")
    );
  }

  // HTTP 429 (Rate Limited), 503 (Service Unavailable), 504 (Gateway Timeout)
  if (error.status) {
    return [429, 503, 504].includes(error.status);
  }

  return false;
}

/**
 * fetch操作を自動リトライト付きで実行
 * @param {string} url
 * @param {object} [options]
 * @param {object} [retryConfig]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, retryConfig = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;

        if (isRetryableError(error) && attempt < config.maxRetries) {
          lastError = error;
          const delay = calculateBackoffDelay(attempt, config);
          logger.warn(`${url} HTTP ${response.status} - 再試行 (${attempt + 1}/${config.maxRetries}) ${delay}ms後`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw error;
      }

      if (attempt > 0) {
        logger.info(`${url} 再試行成功 (${attempt + 1}試行目)`);
      }

      return response;
    } catch (err) {
      lastError = err;

      if (!isRetryableError(err) || attempt >= config.maxRetries) {
        logger.error(`fetch失敗: ${url}`, err);
        throw err;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logger.warn(`${url} エラー - 再試行 (${attempt + 1}/${config.maxRetries}) ${delay}ms後: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * 非同期操作を自動リトライト付きで実行
 * @param {() => Promise<T>} fn
 * @param {string} description - ログ用の説明
 * @param {object} [retryConfig]
 * @returns {Promise<T>}
 */
export async function retryAsync(fn, description = "操作", retryConfig = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("タイムアウト")), config.timeoutMs)
        ),
      ]);

      if (attempt > 0) {
        logger.info(`${description} 再試行成功 (${attempt + 1}試行目)`);
      }

      return result;
    } catch (err) {
      lastError = err;

      if (attempt >= config.maxRetries) {
        logger.error(`${description} 失敗`, err);
        throw err;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logger.warn(`${description} エラー - 再試行 (${attempt + 1}/${config.maxRetries}) ${delay}ms後: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Promise.all互換で、一部失敗時も続行
 * @param {Promise<T>[]} promises
 * @param {string} description
 * @returns {Promise<{ results: T[], errors: Error[] }>}
 */
export async function allSettledWithLogging(promises, description = "") {
  const settled = await Promise.allSettled(promises);
  const results = [];
  const errors = [];

  for (const p of settled) {
    if (p.status === "fulfilled") {
      results.push(p.value);
    } else {
      errors.push(p.reason);
    }
  }

  if (errors.length > 0) {
    const msg = description ? `${description} ` : "";
    logger.warn(`${msg}${errors.length}件のエラー: ${errors.map((e) => e.message).join(", ")}`);
  }

  return { results, errors };
}
