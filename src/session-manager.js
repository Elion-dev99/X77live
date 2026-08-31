/**
 * セッション管理（永続化と自動削除機構）
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getLogger } from "./logger.js";

const logger = getLogger("session-manager");

/**
 * セッションデータディレクトリを取得
 * @returns {string}
 */
function getSessionDir() {
  const dataDir = process.env.DATA_DIR || "data";
  return path.resolve(dataDir);
}

/**
 * セッションファイルのパスを取得
 * @returns {string}
 */
function getSessionsFilePath() {
  return path.join(getSessionDir(), "sessions.json");
}

/**
 * セッションデータを読み込む
 * @returns {object} { sessions: { [token]: { userId, expiresAt } }, ... }
 */
export function loadSessions() {
  const filePath = getSessionsFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { sessions: {}, lastCleanup: new Date().toISOString() };
    }
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    logger.warn(`セッション読み込み失敗: ${err.message}`);
    return { sessions: {}, lastCleanup: new Date().toISOString() };
  }
}

/**
 * セッションデータを保存
 * @param {object} data
 */
export function saveSessions(data) {
  const filePath = getSessionsFilePath();
  try {
    const dir = getSessionDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    logger.debug(`セッション保存: ${Object.keys(data.sessions).length}件`);
  } catch (err) {
    logger.error(`セッション保存失敗: ${err.message}`, err);
  }
}

/**
 * 有効期限切れセッションを削除
 * @param {object} data
 * @param {Date} [now]
 * @returns {number} 削除されたセッション数
 */
export function cleanupExpiredSessions(data, now = new Date()) {
  const before = Object.keys(data.sessions).length;
  const nowTime = now.getTime();

  for (const [token, session] of Object.entries(data.sessions)) {
    const expiresAt = new Date(session.expiresAt).getTime();
    if (nowTime > expiresAt) {
      delete data.sessions[token];
      logger.debug(`有効期限切れセッションを削除: ${session.userId}`);
    }
  }

  const after = Object.keys(data.sessions).length;
  const removed = before - after;

  if (removed > 0) {
    data.lastCleanup = now.toISOString();
    logger.info(`セッションクリーンアップ: ${removed}件削除`);
  }

  return removed;
}

/**
 * 定期クリーンアップ（24時間ごと）を開始
 * @param {() => object} getConfig - getConfig関数
 * @param {(object) => void} persistConfig - persistConfig関数
 * @returns {NodeJS.Timer|null}
 */
export function startSessionCleanupScheduler(getConfig, persistConfig) {
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24時間

  const interval = setInterval(() => {
    try {
      const config = getConfig();
      const sessionData = loadSessions();

      const cleaned = cleanupExpiredSessions(sessionData);
      if (cleaned > 0) {
        saveSessions(sessionData);
      }
    } catch (err) {
      logger.error(`セッションクリーンアップエラー: ${err.message}`, err);
    }
  }, CLEANUP_INTERVAL_MS);

  // 起動時にも1回実行
  try {
    const sessionData = loadSessions();
    const cleaned = cleanupExpiredSessions(sessionData);
    if (cleaned > 0) {
      saveSessions(sessionData);
    }
  } catch (err) {
    logger.warn(`起動時クリーンアップエラー: ${err.message}`);
  }

  logger.info("セッション自動クリーンアップを開始");
  return interval;
}

/**
 * クリーンアップスケジューラーを停止
 * @param {NodeJS.Timer} handle
 */
export function stopSessionCleanupScheduler(handle) {
  if (handle) {
    clearInterval(handle);
    logger.info("セッション自動クリーンアップを停止");
  }
}

/**
 * 新しいセッショントークンを生成
 * @returns {string}
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * セッションを作成して保存
 * @param {string} userId
 * @param {number} sessionHours
 * @returns {string} トークン
 */
export function createSession(userId, sessionHours = 8) {
  const token = generateSessionToken();
  const sessionData = loadSessions();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionHours * 60 * 60 * 1000);

  sessionData.sessions[token] = {
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  saveSessions(sessionData);
  logger.info(`セッション作成: ${userId} (${sessionHours}時間)`);

  return token;
}

/**
 * セッションを検証
 * @param {string} token
 * @param {Date} [now]
 * @returns {{ valid: boolean, userId?: string }}
 */
export function validateSession(token, now = new Date()) {
  if (!token) return { valid: false };

  const sessionData = loadSessions();
  const session = sessionData.sessions[token];

  if (!session) {
    return { valid: false };
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  const nowTime = now.getTime();

  if (nowTime > expiresAt) {
    delete sessionData.sessions[token];
    saveSessions(sessionData);
    logger.debug(`有効期限切れセッションを検証: ${session.userId}`);
    return { valid: false };
  }

  return { valid: true, userId: session.userId };
}

/**
 * セッションを削除
 * @param {string} token
 */
export function revokeSession(token) {
  const sessionData = loadSessions();
  if (sessionData.sessions[token]) {
    const userId = sessionData.sessions[token].userId;
    delete sessionData.sessions[token];
    saveSessions(sessionData);
    logger.info(`セッション削除: ${userId}`);
  }
}

/**
 * ユーザーのすべてのセッションを削除
 * @param {string} userId
 */
export function revokeAllSessions(userId) {
  const sessionData = loadSessions();
  let count = 0;

  for (const [token, session] of Object.entries(sessionData.sessions)) {
    if (session.userId === userId) {
      delete sessionData.sessions[token];
      count++;
    }
  }

  if (count > 0) {
    saveSessions(sessionData);
    logger.info(`${userId}のセッション削除: ${count}件`);
  }
}
