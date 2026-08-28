import { isAdmin, applySetting } from "./config.js";
import {
  getConfig as getStoreConfig,
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

    case "exclude_boy": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

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
      };
    }

    case "include_boy": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

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
      };
    }

    case "setting": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

      let value = parsed.value;

      if (parsed.key === "notifyChannel") {
        const channelMatch = value.match(/^<#(\d+)>$/) || value.match(/^(\d+)$/);
        if (!channelMatch) {
          return {
            type: "text",
            content: "⚠️ チャンネルID または <#チャンネルID> 形式で指定してください。",
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

      if (
        parsed.key === "notifyInterval" ||
        parsed.key === "notifyEnabled"
      ) {
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
      };
    }

    case "settings_show":
      return { type: "embed", embed: buildSettingsEmbed(config) };

    case "notify_test": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

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
          "x77.jp の [2ショットページ](https://x77.jp/live/?mode=online) から",
          "大阪店ボーイの **待機中 / 通話中 / オフライン** を自動監視します。",
          "",
          "### コマンド",
          "• `/状況` — 現在の稼働状況",
          "• `/一覧` — 全ボーイのステータス一覧",
          "• `/更新` — x77.jp から即時取得",
          "• `/履歴` — ステータス変更履歴",
          "• `/設定` — 通知間隔・表示項目等を変更",
          "• `/設定確認` — 現在の設定",
          "• `/通知テスト` — 定期通知のプレビュー",
          "",
          "### 自動監視",
          `- **${config.pollIntervalMinutes || 2}分** ごとに x77.jp をチェック`,
          `- **${config.notifyIntervalMinutes}分** ごとに Discord へ定期通知`,
          "- ステータス変更時に即時通知（設定で ON/OFF）",
        ].join("\n"),
      };

    default:
      return { type: "text", content: "⚠️ 不明なコマンドです。", ephemeral: true };
  }
}
