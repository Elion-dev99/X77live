import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  AttachmentBuilder,
} from "discord.js";
import { buildSlashCommands, parseSlashInteraction } from "./slash-commands.js";
import { initCommands, handleCommand, getConfig, persistConfig } from "./commands.js";
import { buildNotificationEmbed } from "./format.js";
import { startHealthServer } from "./health.js";
import { startNotifier, restartNotifier } from "./notifier.js";
import { startMonitor } from "./monitor.js";
import { scheduleProcessRestart } from "./restart.js";
import { startDailySummaryScheduler } from "./daily-stats.js";
import { startReportBackupScheduler } from "./report-backup.js";
import { startConfigBackupScheduler } from "./config-backup.js";
import { startBotLivenessScheduler } from "./bot-liveness.js";
import { acquireInstanceLock } from "./instance-lock.js";
import { startSessionCleanupScheduler } from "./session-manager.js";
import { info, warn, error } from "./logger.js";

const token = process.env.DISCORD_TOKEN?.trim();
if (!token || token === "your_bot_token_here") {
  error("DISCORD_TOKEN が未設定です。ホスティングの環境変数に DISCORD_TOKEN を設定してください。");
  process.exit(1);
}

if (!acquireInstanceLock()) {
  process.exit(1);
}

const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

info(`NODE_ENV = ${process.env.NODE_ENV || "development"}`);
info(`DISCORD_CLIENT_ID = ${clientId ? "set" : "missing"}`);
info(`DISCORD_GUILD_ID = ${guildId || "(global slash registration)"}`);
info(`PORT = ${process.env.PORT || "(default 8080 for health)"}`);

startHealthServer();

let sessionCleanupHandle = null;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function registerSlashCommands() {
  if (!clientId) {
    warn("DISCORD_CLIENT_ID が未設定のため、スラッシュコマンドを自動登録しません。");
    return;
  }
  const commands = buildSlashCommands();
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      info(`スラッシュコマンドをギルド ${guildId} に登録しました (${commands.length}件)`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      info(`スラッシュコマンドをグローバル登録しました (${commands.length}件)`);
    }
  } catch (err) {
    error("スラッシュコマンド登録エラー", err);
  }
}

client.once(Events.ClientReady, async (c) => {
  try {
    info(`ログイン完了: ${c.user.tag}`);
    initCommands(client);

    const config = getConfig();
    info(`店舗: ${config.storeName} (shop_id=${config.shopId})`);
    info(`監視間隔: ${config.pollIntervalMinutes}分 / 通知間隔: ${config.notifyIntervalMinutes}分`);
    info(`通知チャンネル: ${config.notifyChannelId || "未設定"}`);
    const adminIds = config.adminUserIds?.length
      ? config.adminUserIds.join(", ")
      : config.adminUserId || "未設定";
    info(`管理者DM: ${adminIds}`);

    // セッション自動削除スケジューラーを開始
    sessionCleanupHandle = startSessionCleanupScheduler(getConfig, persistConfig);

    startMonitor(client, getConfig, persistConfig);
    startDailySummaryScheduler(client, getConfig, persistConfig);
    startReportBackupScheduler(client, getConfig, persistConfig);
    startConfigBackupScheduler(getConfig, persistConfig);
    startBotLivenessScheduler(client, getConfig, persistConfig);

    if (config.notifyEnabled) {
      startNotifier(client, getConfig, persistConfig, buildNotificationEmbed);
    }
  } catch (err) {
    error("起動後処理エラー（Bot本体は稼働中）", err);
  }

  await registerSlashCommands();
});

process.on("unhandledRejection", (err) => {
  console.error("[fatal] unhandledRejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
});

client.on("error", (err) => console.error("[discord] error:", err));
client.on("warn", (msg) => console.warn("[discord] warn:", msg));

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild) {
      await interaction.reply({
        content: "⚠️ このコマンドはサーバー内でのみ使えます。",
        ephemeral: true,
      });
      return;
    }

    const parsed = parseSlashInteraction(interaction);
    const result = await handleCommand(interaction, parsed);

    if (!result) {
      await interaction.reply({
        content: "⚠️ 処理結果がありません。",
        ephemeral: true,
      });
      return;
    }

    if (result.type === "deferred") {
      const opts = {
        allowedMentions: { parse: [] },
        content: result.content,
      };
      if (result.embed) opts.embeds = [result.embed];
      if (result.files?.length) {
        opts.files = result.files.map((file) =>
          file.path
            ? new AttachmentBuilder(file.path, { name: file.name })
            : new AttachmentBuilder(Buffer.from(file.content, "utf8"), {
                name: file.name,
              })
        );
      }
      await result.interaction.editReply(opts);
      return;
    }

    if (result.type === "restart") {
      await interaction.reply({
        allowedMentions: { parse: [] },
        content: result.content,
        ephemeral: true,
      });
      scheduleProcessRestart(client, result.reason);
      return;
    }

    if (result.type === "files") {
      const attachments = (result.files || []).map((file) =>
        file.path
          ? new AttachmentBuilder(file.path, { name: file.name })
          : new AttachmentBuilder(Buffer.from(file.content, "utf8"), {
              name: file.name,
            })
      );
      await interaction.reply({
        allowedMentions: { parse: [] },
        content: result.content,
        embeds: result.embed ? [result.embed] : [],
        files: attachments,
        ephemeral: result.ephemeral !== false,
      });
      return;
    }

    const replyOptions = {
      allowedMentions: { parse: [] },
      ephemeral: result.ephemeral || false,
    };

    if (result.type === "embed") {
      replyOptions.embeds = [result.embed];
    } else {
      replyOptions.content = result.content;
    }

    await interaction.reply(replyOptions);
  } catch (err) {
    console.error("インタラクション処理エラー:", err);
    const payload = {
      content:
        "⚠️ 処理中にエラーが発生しました。しばらくしてから再度お試しください。",
      ephemeral: true,
    };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      // ignore
    }
  }
});

client.login(token).catch((err) => {
  console.error("[fatal] Discord ログイン失敗:", err.message);
  process.exit(1);
});
