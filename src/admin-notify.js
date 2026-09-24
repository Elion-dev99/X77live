/**
 * サーバー管理者向け通知（Discord DM）
 */

export function getAdminUserIds(config) {
  const fromConfig = config.adminUserIds?.length
    ? config.adminUserIds
    : config.adminUserId
      ? [config.adminUserId]
      : [];

  if (fromConfig.length > 0) {
    return fromConfig.map(String);
  }

  const env = process.env.ADMIN_USER_ID?.trim();
  if (!env) return [];

  return env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {import('discord.js').Client} client
 * @param {object} config
 * @param {string} content
 * @param {{ files?: Array<{ attachment: Buffer|string, name: string }>, embeds?: import('discord.js').EmbedBuilder[] }} [options]
 */
export async function sendAdminDirectMessage(client, config, content, options = {}) {
  const userIds = getAdminUserIds(config);
  if (userIds.length === 0) {
    console.warn("[admin-notify] ADMIN_USER_ID 未設定のため管理DMをスキップ");
    return false;
  }

  let sent = false;
  for (const userId of userIds) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({
        content: content || undefined,
        embeds: options.embeds,
        files: options.files,
        allowedMentions: { parse: [] },
      });
      sent = true;
      console.log(`[admin-notify] 管理DM送信: ${user.tag || userId}`);
    } catch (err) {
      console.error(`[admin-notify] DM送信失敗 (${userId}):`, err.message);
    }
  }

  return sent;
}

/**
 * アプリケーションエラーを管理者DMへ送信する。
 * エラー通知自身の失敗は呼び出し元へ投げず、ログだけに留める。
 * @param {import('discord.js').Client} client
 * @param {object} config
 * @param {unknown} err
 * @param {string} [context]
 */
export async function sendAdminErrorMessage(client, config, err, context = "不明") {
  if (!client || !config) return false;

  const error = err instanceof Error ? err : new Error(String(err));
  const stack = error.stack || error.message;
  const truncatedStack = stack.length > 3500 ? `${stack.slice(0, 3500)}\n…` : stack;
  const content = [
    "🚨 **X77liveでエラーが発生しました**",
    "",
    `発生箇所: **${context}**`,
    `時刻: ${new Date().toISOString()}`,
    "```text",
    truncatedStack,
    "```",
  ].join("\n");

  return sendAdminDirectMessage(client, config, content);
}
