import { applySetting } from "./config.js";
import { loadConfig as getStoreConfig, saveConfig, addHistory } from "./store.js";
import { buildStatusEmbed, buildNotificationEmbed, buildMemberListEmbed, buildSettingsEmbed, buildHistoryEmbed } from "./format.js";
import { sendPeriodicNotification, restartNotifier } from "./notifier.js";
import { runScrape, restartMonitor } from "./monitor.js";
import { requireAdminAuth, ADMIN_COMMANDS, verifyPassword, authenticateUser, logoutUser, isAuthenticated, isPasswordConfigured } from "./auth.js";
import { sendAdminDirectMessage, sendAdminErrorMessage } from "./admin-notify.js";

let configCache = null;
let clientRef = null;

export function initCommands(client) { clientRef = client; configCache = getStoreConfig(); }
export function getConfig() { if (!configCache) configCache = getStoreConfig(); return configCache; }
export function persistConfig() { saveConfig(configCache); }
export function reloadConfig() { configCache = getStoreConfig(); return configCache; }

function authError(result) { return { type: "text", content: result.message, ephemeral: true }; }
function checkAdminAuth(interaction, password) {
  const result = requireAdminAuth(interaction, getConfig(), password);
  if (!result.ok) return authError(result);
  persistConfig();
  return null;
}
function needsAdminAuth(command) { return ADMIN_COMMANDS.has(command) && command !== "change_password"; }

export async function handleCommand(interaction, parsed) {
  const config = getConfig();
  if (needsAdminAuth(parsed.command)) {
    const denied = checkAdminAuth(interaction, parsed.password);
    if (denied) return denied;
  }

  switch (parsed.command) {
    case "status": return { type: "embed", embed: buildStatusEmbed(config) };
    case "members": return { type: "embed", embed: buildMemberListEmbed(config) };
    case "history": return { type: "embed", embed: buildHistoryEmbed(config, parsed.limit || 10), ephemeral: true };
    case "login": {
      if (!isPasswordConfigured(config)) return { type: "text", content: "⚠️ 管理パスワードが未設定です。", ephemeral: true };
      if (!verifyPassword(parsed.password, config)) return { type: "text", content: "⚠️ パスワードが正しくありません。", ephemeral: true };
      authenticateUser(interaction.user.id, config); persistConfig();
      return { type: "text", content: "✅ 認証しました。", ephemeral: true };
    }
    case "logout": logoutUser(interaction.user.id, config); persistConfig(); return { type: "text", content: "✅ ログアウトしました。", ephemeral: true };
    case "refresh": {
      await interaction.deferReply({ ephemeral: true });
      const result = await runScrape(getConfig, persistConfig, clientRef, { force: true });
      return { type: "deferred", interaction, content: result.error ? `⚠️ 取得失敗: ${result.error}` : "✅ 最新データを取得しました。", embed: buildStatusEmbed(getConfig()), ephemeral: true };
    }
    case "notify_test": {
      await interaction.deferReply({ ephemeral: true });
      const dmSent = await sendAdminDirectMessage(clientRef, getConfig(), ["✅ **管理者DMテスト送信**", "", `時刻: ${new Date().toISOString()}`, "通常のエラー通知経路を確認するためのテストです。"].join("\n"));
      return { type: "deferred", interaction, content: dmSent ? "✅ 管理者DMテストを送信しました。" : "⚠️ 管理者DMを送信できませんでした。ADMIN_USER_IDを確認してください。", ephemeral: true };
    }
    case "error_test": {
      await interaction.deferReply({ ephemeral: true });
      const testError = new Error("これはエラー通知テストです（実際の障害ではありません）");
      const sent = await sendAdminErrorMessage(clientRef, getConfig(), testError, "error notification test");
      return { type: "deferred", interaction, content: sent ? "✅ エラー通知テストをDMへ送信しました。" : "⚠️ エラー通知テストのDM送信に失敗しました。", ephemeral: true };
    }
    case "setting": {
      const result = applySetting(config, parsed.key, parsed.value);
      if (!result.ok) return { type: "text", content: `⚠️ ${result.error}`, ephemeral: true };
      persistConfig();
      if (parsed.key === "notifyInterval" || parsed.key === "notifyEnabled") restartNotifier(clientRef, getConfig, persistConfig, buildNotificationEmbed);
      if (parsed.key === "pollInterval") restartMonitor(clientRef, getConfig, persistConfig);
      return { type: "text", content: `✅ 設定を更新しました: **${parsed.key}** = \`${parsed.value}\``, ephemeral: true };
    }
    case "settings_show": return { type: "embed", embed: buildSettingsEmbed(config), ephemeral: true };
    case "help": return { type: "text", content: "`/状況` `/一覧` `/更新` `/通知テスト` `/エラー通知テスト` `/設定確認`", ephemeral: true };
    default: return { type: "text", content: "⚠️ このコマンドは現在利用できません。", ephemeral: true };
  }
}

export function isUserAuthenticated(userId) { return isAuthenticated(userId, getConfig()); }
