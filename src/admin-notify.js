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
 */
export async function sendAdminDirectMessage(client, config, content) {
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
        content,
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
