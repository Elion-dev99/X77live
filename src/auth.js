import crypto from "node:crypto";

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
  config.auth = config.auth || {
    passwordHash: null,
    passwordSalt: null,
    sessions: {},
    sessionHours: 8,
  };
  if (!config.auth.sessions) config.auth.sessions = {};
  return config.auth;
}

export function initPasswordFromEnv(config) {
  ensureAuthConfig(config);
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (envPassword && !config.auth.passwordHash) {
    const record = createPasswordRecord(envPassword);
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;
  }
}

export function cleanupExpiredSessions(config) {
  const auth = ensureAuthConfig(config);
  const now = Date.now();
  for (const [userId, expiresAt] of Object.entries(auth.sessions)) {
    if (new Date(expiresAt).getTime() <= now) {
      delete auth.sessions[userId];
    }
  }
}

export function isAuthenticated(userId, config) {
  cleanupExpiredSessions(config);
  const expiresAt = config.auth?.sessions?.[userId];
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

export function authenticateUser(userId, config) {
  const auth = ensureAuthConfig(config);
  const hours = auth.sessionHours || 8;
  auth.sessions[userId] = new Date(
    Date.now() + hours * 60 * 60 * 1000
  ).toISOString();
}

export function logoutUser(userId, config) {
  ensureAuthConfig(config);
  delete config.auth.sessions[userId];
}

/**
 * @returns {{ ok: true } | { ok: false, message: string, ephemeral?: boolean }}
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

  if (password && verifyPassword(password, config)) {
    authenticateUser(userId, config);
    return { ok: true };
  }

  if (isAuthenticated(userId, config)) {
    return { ok: true };
  }

  if (password) {
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

export function getSessionExpiry(userId, config) {
  cleanupExpiredSessions(config);
  return config.auth?.sessions?.[userId] || null;
}
