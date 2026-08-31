/**
 * 統一ロギングシステム
 * 全モジュールで一貫したログレベル・フォーマットを提供
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_LEVEL_NAMES = {
  0: "DEBUG",
  1: "INFO",
  2: "WARN",
  3: "ERROR",
};

/**
 * 環境変数から最小ログレベルを取得
 * @returns {number}
 */
function getMinLogLevel() {
  const env = process.env.LOG_LEVEL?.toUpperCase() || "INFO";
  return LOG_LEVELS[env] ?? LOG_LEVELS.INFO;
}

const MIN_LOG_LEVEL = getMinLogLevel();

/**
 * ISO 8601 形式のタイムスタンプ（JST）を取得
 * @returns {string}
 */
function getTimestamp() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const jst = new Date(now.getTime() - offset * 60 * 1000);
  return jst.toISOString().replace("Z", "+09:00");
}

/**
 * ログメッセージをフォーマット
 * @param {number} level
 * @param {string} module
 * @param {string} message
 * @returns {string}
 */
function formatLog(level, module, message) {
  const timestamp = getTimestamp();
  const levelName = LOG_LEVEL_NAMES[level] || "UNKNOWN";
  return `[${timestamp}] [${levelName}] [${module}] ${message}`;
}

/**
 * ログ出力関数
 * @param {number} level
 * @param {string} module
 * @param {string} message
 * @param {any} [extra]
 */
function log(level, module, message, extra = null) {
  if (level < MIN_LOG_LEVEL) return;

  const formatted = formatLog(level, module, message);

  if (level === LOG_LEVELS.ERROR) {
    console.error(formatted);
    if (extra instanceof Error) {
      console.error(extra.stack || extra);
    } else if (extra) {
      console.error(extra);
    }
  } else if (level === LOG_LEVELS.WARN) {
    console.warn(formatted);
    if (extra) console.warn(extra);
  } else {
    console.log(formatted);
    if (extra && level === LOG_LEVELS.DEBUG) console.log(extra);
  }
}

/**
 * モジュール用のロガーを取得
 * @param {string} module
 * @returns {object}
 */
export function getLogger(module) {
  return {
    debug: (msg, extra) => log(LOG_LEVELS.DEBUG, module, msg, extra),
    info: (msg, extra) => log(LOG_LEVELS.INFO, module, msg, extra),
    warn: (msg, extra) => log(LOG_LEVELS.WARN, module, msg, extra),
    error: (msg, extra) => log(LOG_LEVELS.ERROR, module, msg, extra),
  };
}

/**
 * 標準出力用（boot時など、モジュール名不要）
 */
export function info(message) {
  console.log(`[${getTimestamp()}] [INFO] ${message}`);
}

export function warn(message) {
  console.warn(`[${getTimestamp()}] [WARN] ${message}`);
}

export function error(message, err = null) {
  console.error(`[${getTimestamp()}] [ERROR] ${message}`);
  if (err instanceof Error) {
    console.error(err.stack || err);
  } else if (err) {
    console.error(err);
  }
}
