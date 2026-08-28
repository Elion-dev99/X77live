import "./bootstrap-env.js";
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
import { isSandboxMode, getBotModeLabel } from "./env-mode.js";

const token = process.env.DISCORD_TOKEN?.trim();
if (!token || token === "your_bot_token_here") {
  console.error(
    "DISCORD_TOKEN が未設定です。ホスティングの環境変数に DISCORD_TOKEN を設定してください。"
  );
  process.exit(1);
}

const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

console.log("[boot] NODE_ENV=", process.env.NODE_ENV || "development");
console.log("[boot] BOT_MODE=", getBotModeLabel(), isSandboxMode() ? "🧪" : "");
console.log("[boot] DATA_DIR=", process.env.DATA_DIR || "data");
console.log("[boot] DISCORD_CLIENT_ID=", clientId ? "set" : "missing");
console.log("[boot] DISCORD_GUILD_ID=", guildId || "(global slash registration)");
console.log("[boot] PORT=", process.env.PORT || "(default 8080 for health)");

startHealthServer();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function registerSlashCommands() {
  if (!clientId) {
    console.warn(
      "[warn] DISCORD_CLIENT_ID が未設定のため、スラッシュコマンドを自動登録しません。"
    );
    return;
  }
  const commands = buildSlashCommands();
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(
        `スラッシュコマンドをギルド ${guildId} に登録しました (${commands.length}件)`
      );
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      console.log(
        `スラッシュコマンドをグローバル登録しました (${commands.length}件)`
      );
    }
  } catch (err) {
    console.error("スラッシュコマンド登録エラー:", err);
  }
}

client.once(Events.ClientReady, async (c) => {
  try {
    console.log(`ログイン完了: ${c.user.tag}`);
    initCommands(client);

    const config = getConfig();
    console.log(`[boot] 店舗: ${config.storeName} (shop_id=${config.shopId})`);
    console.log(
      `[boot] 監視間隔: ${config.pollIntervalMinutes}分 / 通知間隔: ${config.notifyIntervalMinutes}分`
    );
    console.log(
      `[boot] 通知チャンネル: ${config.notifyChannelId || "未設定"}`
    );

    startMonitor(client, getConfig, persistConfig);
    startDailySummaryScheduler(client, getConfig, persistConfig);

    if (isSandboxMode()) {
      console.log(
        "[boot] 🧪 サンドボックス: 本番とは別 DATA_DIR / 別 Bot トークンで運用してください"
      );
    }

    if (config.notifyEnabled) {
      startNotifier(client, getConfig, persistConfig, buildNotificationEmbed);
    } else if (isSandboxMode()) {
      console.log("[boot] 定期通知: OFF（サンドボックス既定。NOTIFY_ENABLED=true で有効化可）");
    }
  } catch (err) {
    console.error("[warn] 起動後処理エラー（Bot本体は稼働中）:", err);
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
