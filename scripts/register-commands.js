import "../src/bootstrap-env.js";
import { REST, Routes } from "discord.js";
import { buildSlashCommands } from "../src/slash-commands.js";

const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN と DISCORD_CLIENT_ID が必要です");
  process.exit(1);
}

const commands = buildSlashCommands();
const rest = new REST({ version: "10" }).setToken(token);

try {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log(`✅ ギルド ${guildId} に ${commands.length} 件登録しました`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });
    console.log(`✅ グローバルに ${commands.length} 件登録しました`);
  }
} catch (err) {
  console.error("登録エラー:", err);
  process.exit(1);
}
