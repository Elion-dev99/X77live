import { isInQuietHours } from "./config.js";

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
