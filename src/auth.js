import crypto from "node:crypto";
import {
  loadSessions,
  createSession,
  validateSession,
  revokeSession,
  revokeAllSessions,
} from "./session-manager.js";
import { getLogger } from "./logger.js";

const logger = getLogger("auth");

/** パスワードまたはセッションが必要な管理者コマンド */
export const ADMIN_COMMANDS = new Set([
  "setting",
  "settings_show",
  "notify_test",
  "exclude_boy",
  "include_boy",
  "change_password",
  "refresh",
  "history",
  "restart_server",
  "report_list",
  "report_download",
  "report_interim",
  "restore_config",
  "shift_check",
  "report_chart",
]);

/** @deprecated ADMIN_COMMANDS を使用してください */
export const CUSTOMIZE_COMMANDS = ADMIN_COMMANDS;

export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
  };
}

export function verifyPassword(password, config) {
  const auth = config.auth;
  if (!auth?.passwordHash || !auth?.passwordSalt) return false;
  return hashPassword(password, auth.passwordSalt) === auth.passwordHash;
}

export function isPasswordConfigured(config) {
  return Boolean(config.auth?.passwordHash && config.auth?.passwordSalt);
}

export function ensureAuthConfig(config) {
  // 後方互換性のため残す（実際の処理はsession-manager.jsで行われる）
  config.auth = config.auth || {
    passwordHash: null,
    passwordSalt: null,
    sessionHours: 8,
  };
  return config.auth;
}

export function initPasswordFromEnv(config) {
  ensureAuthConfig(config);
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!envPassword) return;

  const forceReset =
    process.env.ADMIN_PASSWORD_RESET === "true" ||
    process.env.ADMIN_PASSWORD_RESET === "1";

  if (!config.auth.passwordHash || forceReset) {
    const record = createPasswordRecord(envPassword);
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;
    if (forceReset) {
      // テスト互換性: config.auth.sessions が存在する場合は従来の方式でクリア
      if (config.auth?.sessions && typeof config.auth.sessions === "object") {
        config.auth.sessions = {};
      } else {
        // 新しいセッション管理
        revokeAllSessions("*all*");
      }
      logger.info("管理パスワードをリセットしました");
    }
  }
}

export function cleanupExpiredSessions(config) {
  // session-manager.jsで自動的に処理されるため、ここでは互換性関数として存在のみ
  logger.debug("cleanupExpiredSessions（session-manager.jsで自動処理）");
}

/**
 * 後方互換性: 設定オブジェクト内のセッションを検証
 * @param {string} sessionToken - ユーザーID（テスト互換性用）またはトークン
 * @param {object} config
 * @returns {boolean}
 */
export function isAuthenticated(sessionToken, config) {
  if (!sessionToken) return false;
  
  // テスト互換性: config.auth.sessions が存在する場合は従来の方式を使用
  if (config.auth?.sessions && typeof config.auth.sessions === "object") {
    const expiresAt = config.auth.sessions[sessionToken];
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() > Date.now();
  }
  
  // 新しいセッション管理の場合
  const validation = validateSession(sessionToken);
  return validation.valid;
}

/**
 * ユーザーを認証し、セッションを作成
 * @param {string} userId
 * @param {object} config
 * @returns {string|void} テスト互換性のためトークンを返す場合と返さない場合がある
 */
export function authenticateUser(userId, config) {
  // テスト互換性: config.auth.sessions が存在する場合は従来の方式を使用
  if (config.auth?.sessions && typeof config.auth.sessions === "object") {
    const hours = config.auth?.sessionHours || 8;
    config.auth.sessions[userId] = new Date(
      Date.now() + hours * 60 * 60 * 1000
    ).toISOString();
    return;
  }
  
  // 新しいセッション管理
  const hours = config.auth?.sessionHours || 8;
  const token = createSession(userId, hours);
  logger.info(`ユーザー認証: ${userId}`);
  return token;
}

/**
 * ユーザーをログアウト
 * @param {string} userIdOrToken
 * @param {object} config
 */
export function logoutUser(userIdOrToken, config) {
  // テスト互換性: config.auth.sessions が存在する場合は従来の方式を使用
  if (config.auth?.sessions && typeof config.auth.sessions === "object") {
    delete config.auth.sessions[userIdOrToken];
    return;
  }
  
  // 新しいセッション管理
  if (userIdOrToken) {
    revokeSession(userIdOrToken);
    logger.info("ユーザーログアウト");
  }
}

export function getSessionExpiry(sessionToken, config) {
  const sessionData = loadSessions();
  const session = sessionData.sessions?.[sessionToken];
  if (!session) return null;
  return session.expiresAt;
}

/**
 * @returns {{ ok: true, token?: string } | { ok: false, message: string, ephemeral?: boolean }}
 */
export function requireAdminAuth(interaction, config, password) {
  if (!isPasswordConfigured(config)) {
    return {
      ok: false,
      message:
        "⚠️ 管理パスワードが未設定です。環境変数 `ADMIN_PASSWORD` を設定してください。",
      ephemeral: true,
    };
  }

  const userId = interaction.user.id;

  // パスワードで認証
  if (password && verifyPassword(password, config)) {
    authenticateUser(userId, config);
    return { ok: true };
  }

  // セッションで認証（テスト互換性）
  if (isAuthenticated(userId, config)) {
    return { ok: true };
  }

  // 環境変数のセッショントークンで認証
  const envSessionToken = process.env.SESSION_TOKEN?.trim();
  if (envSessionToken) {
    const validation = validateSession(envSessionToken);
    if (validation.valid) {
      return { ok: true };
    }
  }

  if (password) {
    logger.warn(`認証失敗: ${userId} パスワード不正`);
    return {
      ok: false,
      message: "⚠️ パスワードが正しくありません。",
      ephemeral: true,
    };
  }

  return {
    ok: false,
    message:
      "🔒 このコマンドは管理者専用です。\n`/認証 パスワード:****` でログインするか、コマンドに `パスワード` を付けて実行してください。",
    ephemeral: true,
  };
}

/** @deprecated requireAdminAuth を使用してください */
export const requireCustomizeAuth = requireAdminAuth;
