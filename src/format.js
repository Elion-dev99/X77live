import { EmbedBuilder } from "discord.js";
import {
  getActiveMembers,
  getOnlineMembers,
  getOfflineMembers,
  isOnline,
} from "./store.js";

function formatDuration(ms) {
  if (!ms || ms < 0) return "0分";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}時間${minutes}分`;
  return `${minutes}分`;
}

function formatDurationSince(isoDate) {
  if (!isoDate) return "";
  const ms = Date.now() - new Date(isoDate).getTime();
  return formatDuration(ms);
}

function sortMembers(members, sortBy) {
  const sorted = [...members];
  switch (sortBy) {
    case "duration":
      sorted.sort((a, b) => {
        const aStart = a.session?.startedAt || "";
        const bStart = b.session?.startedAt || "";
        return aStart.localeCompare(bStart);
      });
      break;
    case "recent":
      sorted.sort((a, b) => {
        const aAdded = a.addedAt || "";
        const bAdded = b.addedAt || "";
        return bAdded.localeCompare(aAdded);
      });
      break;
    case "name":
    default:
      sorted.sort((a, b) =>
        (a.displayName || a.name || "").localeCompare(
          b.displayName || b.name || "",
          "ja"
        )
      );
      break;
  }
  return sorted;
}

function memberLine(member, config, session) {
  const name = member.displayName || member.name || "不明";
  const parts = [`**${name}**`];

  if (config.settings.showDuration && session?.startedAt) {
    parts.push(`(${formatDurationSince(session.startedAt)})`);
  }

  if (config.settings.includeNoteInReport && session?.note) {
    parts.push(`— ${session.note}`);
  }

  return parts.join(" ");
}

export function buildStatusEmbed(config) {
  const onlineRaw = getOnlineMembers(config).map((m) => ({
    ...m,
    session: config.sessions[m.id],
  }));
  const offlineRaw = getOfflineMembers(config);

  const online = sortMembers(onlineRaw, config.settings.sortOnlineBy);
  const offline = sortMembers(offlineRaw, config.settings.sortOfflineBy);

  const total = getActiveMembers(config).length;
  const onlineCount = online.length;
  const offlineCount = offline.length;

  const color =
    onlineCount === 0
      ? config.settings.embedColorOffline
      : offlineCount === 0
        ? config.settings.embedColorOnline
        : config.settings.embedColorSummary;

  const embed = new EmbedBuilder()
    .setTitle(`📡 ${config.storeName} — オンライン稼働状況`)
    .setColor(color)
    .setTimestamp(new Date());

  const summary = [
    `👥 在籍: **${total}** 名`,
    `🟢 オンライン中: **${onlineCount}** 名`,
    `⚪ 未稼働: **${offlineCount}** 名`,
  ].join("  |  ");
  embed.setDescription(summary);

  if (config.settings.showOnlineList) {
    if (online.length > 0) {
      const lines = online.map((m) => memberLine(m, config, m.session));
      embed.addFields({
        name: `🟢 オンライン中 (${onlineCount})`,
        value: lines.join("\n").slice(0, 1024),
      });
    } else {
      embed.addFields({
        name: "🟢 オンライン中 (0)",
        value: "_現在オンライン中のメンバーはいません_",
      });
    }
  }

  if (config.settings.showOfflineList) {
    if (offline.length > 0) {
      const lines = offline.map((m) => {
        const name = m.displayName || m.name || "不明";
        return `**${name}**`;
      });
      embed.addFields({
        name: `⚪ 未稼働 (${offlineCount})`,
        value: lines.join("\n").slice(0, 1024),
      });
    } else {
      embed.addFields({
        name: "⚪ 未稼働 (0)",
        value: "_全員オンライン中です！_",
      });
    }
  }

  if (config.settings.footerText) {
    embed.setFooter({ text: config.settings.footerText });
  }

  return embed;
}

export function buildStatusChangeMessage(config, userId, action, memberName) {
  const name = memberName || "不明";
  if (action === "start") {
    return `🟢 **${name}** がオンラインを開始しました`;
  }
  if (action === "end") {
    return `⚪ **${name}** がオンラインを終了しました`;
  }
  return null;
}

export function buildMemberListEmbed(config) {
  const members = getActiveMembers(config);
  const embed = new EmbedBuilder()
    .setTitle(`👥 ${config.storeName} — 在籍メンバー一覧`)
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  if (members.length === 0) {
    embed.setDescription("_在籍メンバーが登録されていません_");
    return embed;
  }

  const sorted = sortMembers(members, "name");
  const lines = sorted.map((m) => {
    const status = isOnline(config, m.id) ? "🟢" : "⚪";
    const duration =
      isOnline(config, m.id) && config.settings.showDuration
        ? ` (${formatDurationSince(config.sessions[m.id]?.startedAt)})`
        : "";
    return `${status} **${m.displayName || m.name}**${duration}`;
  });

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: `合計 ${members.length} 名` });
  return embed;
}

export function buildSettingsEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ 現在の設定")
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  const fields = [
    { name: "店舗名", value: config.storeName, inline: true },
    {
      name: "通知間隔",
      value: `${config.notifyIntervalMinutes} 分`,
      inline: true,
    },
    {
      name: "定期通知",
      value: config.notifyEnabled ? "✅ 有効" : "❌ 無効",
      inline: true,
    },
    {
      name: "通知チャンネル",
      value: config.notifyChannelId ? `<#${config.notifyChannelId}>` : "未設定",
      inline: true,
    },
    {
      name: "在籍ロール",
      value: config.memberRoleId ? `<@&${config.memberRoleId}>` : "未設定",
      inline: true,
    },
    {
      name: "ステータス変更通知",
      value: config.settings.pingOnStatusChange ? "✅ 有効" : "❌ 無効",
      inline: true,
    },
    {
      name: "表示オプション",
      value: [
        config.settings.showOnlineList ? "オンライン一覧" : null,
        config.settings.showOfflineList ? "未稼働一覧" : null,
        config.settings.showDuration ? "稼働時間" : null,
        config.settings.includeNoteInReport ? "メモ表示" : null,
      ]
        .filter(Boolean)
        .join(" / ") || "なし",
      inline: false,
    },
  ];

  if (config.settings.quietHoursStart && config.settings.quietHoursEnd) {
    fields.push({
      name: "通知停止時間帯",
      value: `${config.settings.quietHoursStart} 〜 ${config.settings.quietHoursEnd}`,
      inline: true,
    });
  }

  embed.addFields(fields);
  return embed;
}

export function buildHistoryEmbed(config, limit = 10) {
  const recent = config.history.slice(-limit).reverse();
  const embed = new EmbedBuilder()
    .setTitle("📋 最近の履歴")
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  if (recent.length === 0) {
    embed.setDescription("_履歴がありません_");
    return embed;
  }

  const lines = recent.map((entry) => {
    const member = config.members[entry.userId];
    const name = member?.displayName || member?.name || entry.userId;
    const time = new Date(entry.at).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    switch (entry.type) {
      case "online_start":
        return `\`${time}\` 🟢 **${name}** 開始${entry.note ? ` — ${entry.note}` : ""}`;
      case "online_end":
        return `\`${time}\` ⚪ **${name}** 終了 (${formatDuration(entry.durationMs)})`;
      case "member_add":
        return `\`${time}\` ➕ **${name}** 登録`;
      case "member_remove":
        return `\`${time}\` ➖ **${name}** 削除`;
      default:
        return `\`${time}\` ${entry.type}`;
    }
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

export { formatDuration, formatDurationSince };
