import { EmbedBuilder } from "discord.js";
import { getMonitoredBoys, getBoysByStatus } from "./store.js";
import { STATUS } from "./scraper.js";
import { formatDurationMinutes, formatSessionPeriod } from "./business-hours.js";

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

function getStatusGroups(config) {
  const all = sortBoys(getMonitoredBoys(config), config.settings.sortBy);
  return {
    all,
    waiting: all.filter((b) => b.status === STATUS.WAITING),
    inCall: all.filter((b) => b.status === STATUS.IN_CALL),
    offline: all.filter((b) => b.status === STATUS.OFFLINE),
  };
}

/**
 * 定期通知用: 待機中・通話中のみ表示
 */
export function buildNotificationEmbed(config) {
  const { waiting, inCall } = getStatusGroups(config);
  const onlineCount = waiting.length + inCall.length;

  const embed = new EmbedBuilder()
    .setTitle(`📡 ${config.storeName} — オンライン`)
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  const desc = [
    `🟢 待機中: **${waiting.length}** 名`,
    `📞 通話中: **${inCall.length}** 名`,
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

  if (onlineCount === 0) {
    embed.setDescription("_現在オンラインのボーイはいません_");
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

export function getOnlineCount(config) {
  const summary = config.lastSummary;
  if (summary) return (summary.waiting || 0) + (summary.inCall || 0);
  const { waiting, inCall } = getStatusGroups(config);
  return waiting.length + inCall.length;
}

export function isOnlineStatus(status) {
  return status === STATUS.WAITING || status === STATUS.IN_CALL;
}

export function buildStatusEmbed(config) {
  const { waiting, inCall, offline } = getStatusGroups(config);

  const summary = config.lastSummary || {
    total: waiting.length + inCall.length + offline.length,
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

export function buildNewBoyMessage(boy, storeName) {
  return [
    "🆕 **新規ボーイを検出しました**",
    `**${boy.name}** (ID: ${boy.boyId}) が${storeName}ロスターに追加されました`,
  ].join("\n");
}

/**
 * @param {object} config
 * @param {{ sessionKey: string, boys: Record<string, { name: string, onlineMinutes: number }> }} stats
 * @param {{ interim?: boolean, asOf?: Date }} [options]
 */
export function buildDailySummaryEmbed(config, stats, options = {}) {
  const settings = config.settings || {};
  const period = formatSessionPeriod(stats.sessionKey, settings);
  const entries = Object.entries(stats.boys || {})
    .map(([boyId, info]) => ({
      boyId,
      name: info.name,
      onlineMinutes: info.onlineMinutes || 0,
    }))
    .sort(
      (a, b) =>
        b.onlineMinutes - a.onlineMinutes ||
        a.name.localeCompare(b.name, "ja")
    );

  const title = options.interim
    ? `📊 ${config.storeName} — 営業途中レポート（暫定）`
    : `📊 ${config.storeName} — 本日のオンライン稼働サマリー`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(options.asOf || new Date());

  const asOfText = options.asOf
    ? options.asOf.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const descParts = [`営業時間: ${period}`];
  if (options.interim && asOfText) {
    descParts.push(`⏱️ 集計時点: **${asOfText}**（確定版は 01:00）`);
  }

  if (entries.length === 0) {
    embed.setDescription(descParts.join("\n"));
    embed.addFields({
      name: "稼働実績",
      value: options.interim
        ? "_現時点でオンライン稼働の記録はありません_"
        : "_本営業日はオンライン稼働がありませんでした_",
    });
    return embed;
  }

  const totalMinutes = entries.reduce((sum, e) => sum + e.onlineMinutes, 0);
  descParts.push(`オンライン稼働: **${entries.length}** 名`);
  embed.setDescription(descParts.join("\n"));

  const lines = entries.map(
    (e, i) =>
      `${i + 1}. **${e.name}** — ${formatDurationMinutes(e.onlineMinutes)}`
  );

  let chunk = "";
  let fieldIndex = 1;
  for (const line of lines) {
    const next = chunk ? `${chunk}\n${line}` : line;
    if (next.length > 1000 && chunk) {
      embed.addFields({
        name: fieldIndex === 1 ? "稼働時間ランキング" : "　",
        value: chunk,
      });
      fieldIndex++;
      chunk = line;
    } else {
      chunk = next;
    }
  }
  if (chunk) {
    embed.addFields({
      name: fieldIndex === 1 ? "稼働時間ランキング" : "　",
      value: chunk.slice(0, 1024),
    });
  }

  embed.setFooter({
    text: `${config.settings.footerText} | 合計 ${formatDurationMinutes(totalMinutes)}`,
  });

  return embed;
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

export function buildReportListEmbed(config, reports) {
  const embed = new EmbedBuilder()
    .setTitle(`📁 ${config.storeName} — 営業日レポート一覧`)
    .setColor(config.settings.embedColorSummary)
    .setTimestamp(new Date());

  if (!reports.length) {
    embed.setDescription(
      "_保存済みレポートがありません。毎日 01:00 に自動生成されます。_"
    );
    return embed;
  }

  const lines = reports.map((entry) => {
    const mins =
      entry.totalOnlineMinutes != null
        ? ` / 合計 ${formatDurationMinutes(entry.totalOnlineMinutes)}`
        : "";
    return `• **${entry.sessionKey}** — ${entry.period}（${entry.onlineCount}名${mins}）`;
  });

  embed.setDescription(lines.join("\n").slice(0, 4000));
  embed.setFooter({
    text: "`/レポート取得 営業日:YYYY-MM-DD 形式:CSV` でダウンロード",
  });
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
    if (entry.type === "boy_new") {
      return `\`${time}\` 🆕 **${entry.name}** ロスター追加`;
    }
    if (entry.type === "daily_summary") {
      return `\`${time}\` 📊 日次サマリー送信 (${entry.sessionKey})`;
    }
    return `\`${time}\` ${entry.type}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}
