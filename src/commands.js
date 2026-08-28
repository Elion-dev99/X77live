import {
  loadConfig,
  saveConfig,
  getOrCreateMember,
  getMember,
  startSession,
  endSession,
  isOnline,
  addHistory,
} from "./store.js";
import { isAdmin, applySetting, SETTING_KEYS } from "./config.js";
import {
  buildStatusEmbed,
  buildMemberListEmbed,
  buildSettingsEmbed,
  buildHistoryEmbed,
  buildStatusChangeMessage,
  formatDuration,
} from "./format.js";
import {
  sendStatusChangeNotification,
  sendPeriodicNotification,
  restartNotifier,
} from "./notifier.js";

let configCache = null;
let clientRef = null;

export function initCommands(client) {
  clientRef = client;
  configCache = loadConfig();
}

export function getConfig() {
  if (!configCache) configCache = loadConfig();
  return configCache;
}

export function persistConfig() {
  saveConfig(configCache);
}

export function reloadConfig() {
  configCache = loadConfig();
  return configCache;
}

function ensureMemberRegistered(config, userId, displayName) {
  const member = getMember(config, userId);
  if (!member || !member.active) {
    return {
      ok: false,
      message:
        "⚠️ 在籍メンバーとして登録されていません。管理者に `/メンバー登録` を依頼してください。",
    };
  }
  getOrCreateMember(config, userId, displayName);
  return { ok: true };
}

export async function handleCommand(interaction, parsed) {
  const config = getConfig();
  const userId = interaction.user.id;
  const displayName =
    interaction.member?.displayName ||
    interaction.user.displayName ||
    interaction.user.username;

  switch (parsed.command) {
    case "start": {
      const check = ensureMemberRegistered(config, userId, displayName);
      if (!check.ok) return { type: "text", content: check.message };

      if (isOnline(config, userId)) {
        const session = config.sessions[userId];
        return {
          type: "text",
          content: `⚠️ すでにオンライン中です（開始: ${new Date(session.startedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）`,
          ephemeral: true,
        };
      }

      startSession(config, userId, parsed.note);
      persistConfig();

      const msg = buildStatusChangeMessage(config, userId, "start", displayName);
      if (clientRef) {
        await sendStatusChangeNotification(clientRef, config, msg, userId);
      }

      const noteText = parsed.note ? `\n📝 メモ: ${parsed.note}` : "";
      return {
        type: "text",
        content: `🟢 **${displayName}** のオンライン稼働を開始しました！${noteText}`,
      };
    }

    case "stop": {
      const check = ensureMemberRegistered(config, userId, displayName);
      if (!check.ok) return { type: "text", content: check.message };

      if (!isOnline(config, userId)) {
        return {
          type: "text",
          content: "⚠️ オンライン中ではありません。",
          ephemeral: true,
        };
      }

      const result = endSession(config, userId);
      persistConfig();

      const msg = buildStatusChangeMessage(config, userId, "end", displayName);
      if (clientRef) {
        await sendStatusChangeNotification(clientRef, config, msg, userId);
      }

      return {
        type: "text",
        content: `⚪ **${displayName}** のオンライン稼働を終了しました（稼働時間: ${formatDuration(result.durationMs)}）`,
      };
    }

    case "status":
      return { type: "embed", embed: buildStatusEmbed(config) };

    case "members":
      return { type: "embed", embed: buildMemberListEmbed(config) };

    case "history":
      return {
        type: "embed",
        embed: buildHistoryEmbed(config, parsed.limit),
      };

    case "add_member": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

      const target = parsed.user;
      const name = parsed.displayName || target.displayName || target.username;
      getOrCreateMember(config, target.id, name);
      addHistory(config, { type: "member_add", userId: target.id });
      persistConfig();

      return {
        type: "text",
        content: `✅ **${name}** (<@${target.id}>) を在籍メンバーに登録しました。`,
      };
    }

    case "remove_member": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

      const target = parsed.user;
      const member = getMember(config, target.id);
      if (!member) {
        return {
          type: "text",
          content: "⚠️ このユーザーは在籍メンバーに登録されていません。",
          ephemeral: true,
        };
      }

      member.active = false;
      if (isOnline(config, target.id)) {
        endSession(config, target.id);
      }
      addHistory(config, { type: "member_remove", userId: target.id });
      persistConfig();

      return {
        type: "text",
        content: `✅ **${member.displayName || member.name}** を在籍から削除しました。`,
      };
    }

    case "sync_roles": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

      if (!config.memberRoleId) {
        return {
          type: "text",
          content:
            "⚠️ 在籍ロールが未設定です。`/設定 項目:在籍ロール 値:<ロールID>` で設定してください。",
          ephemeral: true,
        };
      }

      const guild = interaction.guild;
      const role = await guild.roles.fetch(config.memberRoleId);
      if (!role) {
        return {
          type: "text",
          content: "⚠️ 在籍ロールが見つかりません。",
          ephemeral: true,
        };
      }

      let added = 0;
      for (const [, guildMember] of role.members) {
        const existing = getMember(config, guildMember.id);
        if (!existing || !existing.active) {
          getOrCreateMember(
            config,
            guildMember.id,
            guildMember.displayName || guildMember.user.username
          );
          addHistory(config, { type: "member_add", userId: guildMember.id });
          added++;
        }
      }
      persistConfig();

      return {
        type: "text",
        content: `✅ ロール **${role.name}** から **${added}** 名を新規登録しました（ロールメンバー合計: ${role.members.size} 名）。`,
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

      if (parsed.key === "memberRole" || parsed.key === "mentionRole") {
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

      const keyLabel = Object.entries(SETTING_KEYS).find(
        ([, v]) => v === SETTING_KEYS[parsed.key]
      )?.[0] || parsed.key;

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

      if (clientRef) {
        await sendPeriodicNotification(getConfig, persistConfig, buildStatusEmbed);
      }

      return {
        type: "text",
        content: "✅ 通知テストを送信しました（通知チャンネルに届きます）。",
        ephemeral: true,
      };
    }

    case "force_stop": {
      if (!isAdmin(interaction.member, config)) {
        return { type: "text", content: "⚠️ 管理者権限が必要です。", ephemeral: true };
      }

      const target = parsed.user;
      if (!isOnline(config, target.id)) {
        return {
          type: "text",
          content: "⚠️ このユーザーはオンライン中ではありません。",
          ephemeral: true,
        };
      }

      const member = getMember(config, target.id);
      const name = member?.displayName || target.displayName || target.username;
      const result = endSession(config, target.id);
      persistConfig();

      return {
        type: "text",
        content: `✅ **${name}** のオンラインを強制終了しました（稼働時間: ${formatDuration(result.durationMs)}）`,
      };
    }

    case "help":
      return {
        type: "text",
        content: [
          "## 📡 X77live オンライン稼働管理Bot",
          "",
          "### メンバー向け",
          "• `/オンライン開始` — オンライン稼働を開始（メモ付き可）",
          "• `/オンライン終了` — オンライン稼働を終了",
          "• `/状況` — 現在の稼働状況を表示",
          "• `/在籍一覧` — 在籍メンバー一覧",
          "• `/履歴` — 最近の開始/終了履歴",
          "",
          "### 管理者向け",
          "• `/メンバー登録` — 在籍メンバーを追加",
          "• `/メンバー削除` — 在籍メンバーを削除",
          "• `/ロール同期` — 在籍ロールから自動登録",
          "• `/設定` — 通知間隔・チャンネル等を変更",
          "• `/設定確認` — 現在の設定を表示",
          "• `/通知テスト` — 定期通知のプレビュー",
          "• `/強制終了` — 指定メンバーを強制オフライン",
          "",
          "### 定期通知",
          `デフォルト **10分** ごとに通知チャンネルへ稼働状況を送信します。`,
          "`/設定` で間隔・表示項目・通知停止時間帯などをカスタマイズできます。",
        ].join("\n"),
      };

    default:
      return { type: "text", content: "⚠️ 不明なコマンドです。", ephemeral: true };
  }
}

export async function syncMembersFromRole(guild, config) {
  if (!config.memberRoleId) return;

  try {
    const role = await guild.roles.fetch(config.memberRoleId);
    if (!role) return;

    let changed = false;
    for (const [, guildMember] of role.members) {
      const existing = getMember(config, guildMember.id);
      if (!existing || !existing.active) {
        getOrCreateMember(
          config,
          guildMember.id,
          guildMember.displayName || guildMember.user.username
        );
        changed = true;
      }
    }
    if (changed) persistConfig();
  } catch (err) {
    console.warn("[sync] role sync error:", err.message);
  }
}
