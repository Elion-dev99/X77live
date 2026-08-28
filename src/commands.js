import { applySetting } from "./config.js";
import {
  loadConfig as getStoreConfig,
  saveConfig,
  addHistory,
} from "./store.js";
import {
  buildStatusEmbed,
  buildMemberListEmbed,
  buildSettingsEmbed,
  buildHistoryEmbed,
} from "./format.js";
import {
  sendPeriodicNotification,
  restartNotifier,
} from "./notifier.js";
import { runScrape, restartMonitor } from "./monitor.js";
import {
  requireCustomizeAuth,
  verifyPassword,
  authenticateUser,
  logoutUser,
  createPasswordRecord,
  isAuthenticated,
  getSessionExpiry,
  isPasswordConfigured,
} from "./auth.js";

let configCache = null;
/** @type {import('discord.js').Client|null} */
let clientRef = null;

export function initCommands(client) {
  clientRef = client;
  configCache = getStoreConfig();
}

export function getConfig() {
  if (!configCache) configCache = getStoreConfig();
  return configCache;
}

export function persistConfig() {
  saveConfig(configCache);
}

export function reloadConfig() {
  configCache = getStoreConfig();
  return configCache;
}

function authError(result) {
  return {
    type: "text",
    content: result.message,
    ephemeral: true,
  };
}

function checkCustomizeAuth(interaction, password) {
  const config = getConfig();
  const result = requireCustomizeAuth(interaction, config, password);
  if (!result.ok) {
    return authError(result);
  }
  persistConfig();
  return null;
}

export async function handleCommand(interaction, parsed) {
  const config = getConfig();

  switch (parsed.command) {
    case "status":
      return { type: "embed", embed: buildStatusEmbed(config) };

    case "members":
      return { type: "embed", embed: buildMemberListEmbed(config) };

    case "history":
      return {
        type: "embed",
        embed: buildHistoryEmbed(config, parsed.limit),
      };

    case "refresh": {
      await interaction.deferReply();
      try {
        const result = await runScrape(getConfig, persistConfig, clientRef);
        const s = result.summary;
        return {
          type: "deferred",
          interaction,
          content: `✅ x77.jp から最新データを取得しました\n🟢 待機中: **${s.waiting}** / 📞 通話中: **${s.inCall}** / ⚪ オフライン: **${s.offline}**`,
          embed: buildStatusEmbed(getConfig()),
        };
      } catch (err) {
        return {
          type: "deferred",
          interaction,
          content: `⚠️ 取得失敗: ${err.message}`,
          ephemeral: true,
        };
      }
    }

    case "login": {
      if (!isPasswordConfigured(config)) {
        return {
          type: "text",
          content:
            "⚠️ 管理パスワードが未設定です。Railway Variables に `ADMIN_PASSWORD` を設定してください。",
          ephemeral: true,
        };
      }
      if (!verifyPassword(parsed.password, config)) {
        return {
          type: "text",
          content: "⚠️ パスワードが正しくありません。",
          ephemeral: true,
        };
      }
      authenticateUser(interaction.user.id, config);
      persistConfig();
      const expires = getSessionExpiry(interaction.user.id, config);
      const time = new Date(expires).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        type: "text",
        content: `✅ 認証しました（有効期限: ${time} まで）\nカスタマイズコマンドが使えます。`,
        ephemeral: true,
      };
    }

    case "logout": {
      logoutUser(interaction.user.id, config);
      persistConfig();
      return {
        type: "text",
        content: "✅ ログアウトしました。",
        ephemeral: true,
      };
    }

    case "change_password": {
      if (!isPasswordConfigured(config)) {
        return {
          type: "text",
          content: "⚠️ 管理パスワードが未設定です。",
          ephemeral: true,
        };
      }
      if (!verifyPassword(parsed.currentPassword, config)) {
        return {
          type: "text",
          content: "⚠️ 現在のパスワードが正しくありません。",
          ephemeral: true,
        };
      }
      if (!parsed.newPassword || parsed.newPassword.length < 4) {
        return {
          type: "text",
          content: "⚠️ 新しいパスワードは4文字以上にしてください。",
          ephemeral: true,
        };
      }
      const record = createPasswordRecord(parsed.newPassword);
      config.auth.passwordSalt = record.passwordSalt;
      config.auth.passwordHash = record.passwordHash;
      config.auth.sessions = {};
      authenticateUser(interaction.user.id, config);
      persistConfig();
      return {
        type: "text",
        content: "✅ パスワードを変更しました。全セッションをリセットしました。",
        ephemeral: true,
      };
    }

    case "exclude_boy": {
      const denied = checkCustomizeAuth(interaction, parsed.password);
      if (denied) return denied;

      const boyId = parsed.boyId;
      if (!config.boys[boyId] && !config.boyStatuses[boyId]) {
        return {
          type: "text",
          content: "⚠️ この boy_id は見つかりません。",
          ephemeral: true,
        };
      }

      if (!config.boys[boyId]) {
        config.boys[boyId] = {
          name: config.boyStatuses[boyId]?.name || boyId,
          excluded: true,
        };
      } else {
        config.boys[boyId].excluded = true;
      }

      const name = config.boys[boyId].name;
      delete config.boyStatuses[boyId];
      addHistory(config, { type: "boy_exclude", boyId, name });
      persistConfig();

      return {
        type: "text",
        content: `✅ **${name}** (ID: ${boyId}) を監視対象から除外しました。`,
        ephemeral: true,
      };
    }

    case "include_boy": {
      const denied = checkCustomizeAuth(interaction, parsed.password);
      if (denied) return denied;

      const boyId = parsed.boyId;
      if (!config.boys[boyId]) {
        return {
          type: "text",
          content: "⚠️ この boy_id は見つかりません。",
          ephemeral: true,
        };
      }

      config.boys[boyId].excluded = false;
      addHistory(config, {
        type: "boy_include",
        boyId,
        name: config.boys[boyId].name,
      });
      persistConfig();

      await runScrape(getConfig, persistConfig, clientRef);

      return {
        type: "text",
        content: `✅ **${config.boys[boyId].name}** (ID: ${boyId}) を監視対象に再追加しました。`,
        ephemeral: true,
      };
    }

    case "setting": {
      const denied = checkCustomizeAuth(interaction, parsed.password);
      if (denied) return denied;

      let value = parsed.value;

      if (parsed.key === "notifyChannel") {
        const channelMatch = value.match(/^<#(\d+)>$/) || value.match(/^(\d+)$/);
        if (!channelMatch) {
          return {
            type: "text",
            content:
              "⚠️ チャンネルID または <#チャンネルID> 形式で指定してください。",
            ephemeral: true,
          };
        }
        value = channelMatch[1];
      }

      if (parsed.key === "mentionRole") {
        const roleMatch = value.match(/^<@&(\d+)>$/) || value.match(/^(\d+)$/);
        if (!roleMatch) {
          return {
            type: "text",
            content: "⚠️ ロールID または <@&ロールID> 形式で指定してください。",
            ephemeral: true,
          };
        }
        value = roleMatch[1];
      }

      const result = applySetting(config, parsed.key, value);
      if (!result.ok) {
        return { type: "text", content: `⚠️ ${result.error}`, ephemeral: true };
      }

      persistConfig();

      if (parsed.key === "notifyInterval" || parsed.key === "notifyEnabled") {
        if (clientRef) {
          restartNotifier(
            clientRef,
            getConfig,
            persistConfig,
            buildStatusEmbed
          );
        }
      }

      if (parsed.key === "pollInterval") {
        if (clientRef) {
          restartMonitor(clientRef, getConfig, persistConfig);
        }
      }

      return {
        type: "text",
        content: `✅ 設定を更新しました: **${parsed.key}** = \`${value}\``,
        ephemeral: true,
      };
    }

    case "settings_show": {
      const denied = checkCustomizeAuth(interaction, parsed.password);
      if (denied) return denied;
      return {
        type: "embed",
        embed: buildSettingsEmbed(config),
        ephemeral: true,
      };
    }

    case "notify_test": {
      const denied = checkCustomizeAuth(interaction, parsed.password);
      if (denied) return denied;

      await runScrape(getConfig, persistConfig, clientRef);

      if (clientRef) {
        await sendPeriodicNotification(getConfig, persistConfig, buildStatusEmbed);
      }

      return {
        type: "text",
        content: "✅ 最新データを取得し、通知テストを送信しました。",
        ephemeral: true,
      };
    }

    case "help":
      return {
        type: "text",
        content: [
          "## 📡 X77live 大阪店 オンライン監視Bot",
          "",
          "### 一般コマンド（誰でも可）",
          "• `/状況` `/一覧` `/更新` `/履歴`",
          "",
          "### カスタマイズコマンド（🔒 パスワード必須）",
          "• `/認証` — パスワードでログイン（セッション有効）",
          "• `/設定` `/設定確認` `/通知テスト`",
          "• `/監視除外` `/監視再開` `/パスワード変更`",
          "• `/ログアウト` — セッション終了",
          "",
          "未ログイン時は各コマンドの `パスワード` オプションでも実行できます。",
          "",
          "### 自動監視",
          `- **${config.pollIntervalMinutes || 2}分** ごとに x77.jp をチェック`,
          `- **${config.notifyIntervalMinutes}分** ごとに Discord へ定期通知`,
        ].join("\n"),
      };

    default:
      return { type: "text", content: "⚠️ 不明なコマンドです。", ephemeral: true };
  }
}

export function isUserAuthenticated(userId) {
  return isAuthenticated(userId, getConfig());
}
