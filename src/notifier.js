import { isInQuietHours } from "./config.js";
import { getOnlineCount, buildNewBoyMessage } from "./format.js";

let intervalHandle = null;
let currentClient = null;

export function startNotifier(client, getConfig, saveConfigFn, buildEmbed) {
  stopNotifier();
  currentClient = client;

  const config = getConfig();
  const intervalMs = (config.notifyIntervalMinutes || 10) * 60 * 1000;

  console.log(
    `[notifier] 定期通知を開始: ${config.notifyIntervalMinutes}分間隔`
  );

  intervalHandle = setInterval(async () => {
    await sendPeriodicNotification(getConfig, saveConfigFn, buildEmbed);
  }, intervalMs);

  // 起動直後にも1回送信
  sendPeriodicNotification(getConfig, saveConfigFn, buildEmbed).catch((err) => {
    console.error("[notifier] 初回通知エラー:", err.message);
  });

  return intervalHandle;
}

export function stopNotifier() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[notifier] 定期通知を停止");
  }
}

export function restartNotifier(client, getConfig, saveConfigFn, buildEmbed) {
  stopNotifier();
  const config = getConfig();
  if (config.notifyEnabled) {
    startNotifier(client, getConfig, saveConfigFn, buildEmbed);
  }
}

export async function sendPeriodicNotification(
  getConfig,
  saveConfigFn,
  buildEmbed
) {
  const config = getConfig();

  if (!config.notifyEnabled) return;
  if (!config.notifyChannelId) {
    console.warn("[notifier] notifyChannelId 未設定のため通知をスキップ");
    return;
  }
  if (isInQuietHours(config)) {
    console.log("[notifier] 通知停止時間帯のためスキップ");
    return;
  }

  if (getOnlineCount(config) === 0) {
    console.log("[notifier] オンライン0名のため通知をスキップ");
    return;
  }

  const client = currentClient;
  if (!client) return;

  try {
    const channel = await client.channels.fetch(config.notifyChannelId);
    if (!channel?.isTextBased()) {
      console.warn("[notifier] 通知先がテキストチャンネルではありません");
      return;
    }

    const embed = buildEmbed(config);
    const content = buildMentionContent(config);

    await channel.send({
      content: content || undefined,
      embeds: [embed],
      allowedMentions: buildAllowedMentions(config),
    });

    config.lastNotifyAt = new Date().toISOString();
    saveConfigFn(config);
    console.log(`[notifier] 定期通知送信完了 (${new Date().toISOString()})`);
  } catch (err) {
    console.error("[notifier] 通知送信エラー:", err.message);
  }
}

function buildMentionContent(config) {
  const parts = [];

  if (config.mentionRoleId) {
    parts.push(`<@&${config.mentionRoleId}>`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function buildAllowedMentions(config) {
  const mentions = { parse: [] };
  if (config.mentionRoleId) {
    mentions.roles = [config.mentionRoleId];
  }
  if (config.mentionOffline) {
    mentions.parse = ["users"];
  }
  return mentions;
}

export async function sendStatusChangeNotification(client, config, message) {
  if (!config.settings.pingOnStatusChange) return;

  const channelId =
    config.settings.statusChangeChannelId || config.notifyChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    await channel.send({
      content: message,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[notifier] ステータス変更通知エラー:", err.message);
  }
}

function getAlertChannelId(config) {
  return config.settings.statusChangeChannelId || config.notifyChannelId;
}

export async function sendScrapeFailureAlert(client, config, health) {
  if (config.settings?.scrapeAlertEnabled === false) return;

  const channelId = getAlertChannelId(config);
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const threshold = config.settings?.scrapeAlertThreshold || 3;
    const pollMinutes = config.pollIntervalMinutes || 2;
    const lines = [
      "⚠️ **x77.jp 取得失敗アラート**",
      "",
      `x77.jp からのデータ取得が **${health.consecutiveFailures} 回** 連続で失敗しました（閾値: ${threshold} 回）。`,
      `最後のエラー: \`${health.lastError || "不明"}\``,
      "",
      `監視間隔は ${pollMinutes} 分です。サイト障害やネットワーク問題の可能性があります。`,
      "復旧すると自動で通知します。",
    ];

    await channel.send({
      content: lines.join("\n"),
      allowedMentions: { parse: [] },
    });
    console.log(
      `[notifier] 取得失敗アラート送信 (${health.consecutiveFailures} 回連続)`
    );
  } catch (err) {
    console.error("[notifier] 取得失敗アラート送信エラー:", err.message);
  }
}

export async function sendScrapeRecoveryNotification(client, config, previousFailures) {
  if (config.settings?.scrapeAlertEnabled === false) return;
  if (!previousFailures) return;

  const channelId = getAlertChannelId(config);
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const lines = [
      "✅ **x77.jp 取得が復旧しました**",
      "",
      `${previousFailures} 回連続失敗の後、正常にデータを取得できました。`,
    ];

    await channel.send({
      content: lines.join("\n"),
      allowedMentions: { parse: [] },
    });
    console.log("[notifier] 取得復旧通知送信");
  } catch (err) {
    console.error("[notifier] 取得復旧通知送信エラー:", err.message);
  }
}

export async function sendNewBoyNotification(client, config, boy) {
  if (config.settings.pingOnNewBoy === false) return;

  const channelId =
    config.settings.statusChangeChannelId || config.notifyChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    await channel.send({
      content: buildNewBoyMessage(boy, config.storeName),
      allowedMentions: { parse: [] },
    });
    console.log(`[notifier] 新規ボーイ通知: ${boy.name} (${boy.boyId})`);
  } catch (err) {
    console.error("[notifier] 新規ボーイ通知エラー:", err.message);
  }
}
