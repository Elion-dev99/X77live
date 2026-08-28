import "dotenv/config";

const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) {
  console.error("DISCORD_CLIENT_ID が必要です");
  process.exit(1);
}

// View Channels + Send Messages + Embed Links + Read Message History
const permissions = "84992";
const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

console.log("Bot 招待URL:");
console.log(url);
