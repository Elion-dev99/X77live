import { EmbedBuilder } from "discord.js";
import { getMonitoredBoys, getBoysByStatus } from "./store.js";
import { STATUS } from "./scraper.js";

function sortBoys(boys, sortBy) {
  const sorted = [...boys];
  if (sortBy === "status") {
    const order = { [STATUS.IN_CALL]: 0, [STATUS.WAITING]: 1, [STATUS.OFFLINE]: 2 };
    sorted.sort(
      (a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        a.name.localeCompare(b.name, "ja")
    );
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  return sorted;
}

function boyLine(boy) {
  const liveTag = boy.liveName && boy.liveName !== boy.name ? ` (${boy.liveName})` : "";
  return `**${boy.name}**${liveTag}`;
}

function fieldValue(boys, emptyText) {
  if (boys.length === 0) return emptyText;
  return boys.map(boyLine).join("\n").slice(0, 1024);
}

export function buildStatusEmbed(config) {
  const all = sortBoys(getMonitoredBoys(config), config.settings.sortBy);
  const waiting = all.filter((b) => b.status === STATUS.WAITING);
  const inCall = all.filter((b) => b.status === STATUS.IN_CALL);
  const offline = all.filter((b) => b.status === STATUS.OFFLINE);

  const summary = config.lastSummary || {
    total: all.length,
    waiting: waiting.length,
    inCall: inCall.length,
    offline: offline.length,
  };

  const embed = new EmbedBuilder()
    .setTitle(`📡 ${config.storeName} — オンライン稼働状況`)
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  const desc = [
    `👥 監視対象: **${summary.total}** 名`,
    `🟢 待機中: **${summary.waiting}** 名`,
    `📞 通話中: **${summary.inCall}** 名`,
    `⚪ オフライン: **${summary.offline}** 名`,
  ].join("  |  ");
  embed.setDescription(desc);

  if (config.settings.showInCallList) {
    embed.addFields({
      name: `📞 通話中 (${inCall.length})`,
      value: fieldValue(inCall, "_通話中のボーイはいません_"),
    });
  }

  if (config.settings.showWaitingList) {
    embed.addFields({
      name: `🟢 待機中 (${waiting.length})`,
      value: fieldValue(waiting, "_待機中のボーイはいません_"),
    });
  }

  if (config.settings.showOfflineList) {
    embed.addFields({
      name: `⚪ オフライン (${offline.length})`,
      value: fieldValue(offline, "_全員オンライン中です_"),
    });
  }

  if (config.lastScrapeAt) {
    const t = new Date(config.lastScrapeAt).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    });
    embed.setFooter({
      text: `${config.settings.footerText} | 最終更新 ${t}`,
    });
  } else if (config.settings.footerText) {
    embed.setFooter({ text: config.settings.footerText });
  }

  if (config.settings.liveUrl) {
    embed.setURL(config.settings.liveUrl);
  }

  return embed;
}

/**
 * @param {{ name: string, from: string, to: string }} change
 */
export function buildBoyStatusChangeMessage(change) {
  const icon = {
    [STATUS.WAITING]: "🟢",
    [STATUS.IN_CALL]: "📞",
    [STATUS.OFFLINE]: "⚪",
  };
  return `${icon[change.to] || "🔔"} **${change.name}**: ${change.from} → **${change.to}**`;
}

export function buildMemberListEmbed(config) {
  const boys = sortBoys(getMonitoredBoys(config), "name");
  const embed = new EmbedBuilder()
    .setTitle(`👥 ${config.storeName} — ボーイ一覧`)
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  if (boys.length === 0) {
    embed.setDescription(
      "_まだデータがありません。`/更新` で x77.jp から取得してください。_"
    );
    return embed;
  }

  const icon = {
    [STATUS.WAITING]: "🟢",
    [STATUS.IN_CALL]: "📞",
    [STATUS.OFFLINE]: "⚪",
  };

  const lines = boys.map(
    (b) => `${icon[b.status] || "❓"} **${b.name}** — ${b.status}`
  );
  embed.setDescription(lines.join("\n").slice(0, 4000));
  embed.setFooter({ text: `合計 ${boys.length} 名` });
  return embed;
}

export function buildSettingsEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ 現在の設定")
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  embed.addFields(
    { name: "店舗名", value: config.storeName, inline: true },
    { name: "店舗ID (shop_id)", value: config.shopId || "4", inline: true },
    {
      name: "監視間隔",
      value: `${config.pollIntervalMinutes || 2} 分`,
      inline: true,
    },
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
      name: "認証セッション",
      value: `${config.auth?.sessionHours || 8} 時間`,
      inline: true,
    },
    {
      name: "ステータス変更通知",
      value: config.settings.pingOnStatusChange ? "✅ 有効" : "❌ 無効",
      inline: true,
    },
    {
      name: "表示項目",
      value: [
        config.settings.showWaitingList ? "待機中" : null,
        config.settings.showInCallList ? "通話中" : null,
        config.settings.showOfflineList ? "オフライン" : null,
      ]
        .filter(Boolean)
        .join(" / ") || "なし",
      inline: false,
    }
  );

  if (config.settings.quietHoursStart && config.settings.quietHoursEnd) {
    embed.addFields({
      name: "通知停止時間帯",
      value: `${config.settings.quietHoursStart} 〜 ${config.settings.quietHoursEnd}`,
      inline: true,
    });
  }

  return embed;
}

export function buildHistoryEmbed(config, limit = 10) {
  const recent = config.history.slice(-limit).reverse();
  const embed = new EmbedBuilder()
    .setTitle("📋 最近のステータス変更")
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  if (recent.length === 0) {
    embed.setDescription("_履歴がありません_");
    return embed;
  }

  const lines = recent.map((entry) => {
    const time = new Date(entry.at).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (entry.type === "status_change") {
      return `\`${time}\` **${entry.name}**: ${entry.from} → ${entry.to}`;
    }
    if (entry.type === "boy_exclude") {
      return `\`${time}\` 🚫 **${entry.name}** 監視除外`;
    }
    if (entry.type === "boy_include") {
      return `\`${time}\` ✅ **${entry.name}** 監視再開`;
    }
    return `\`${time}\` ${entry.type}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}
