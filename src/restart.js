/** Bot-Hosting 等がプロセス終了後に自動再起動する想定 */
export function scheduleProcessRestart(client, reason = "discord command") {
  console.log(`[restart] scheduling process exit (${reason})`);
  setTimeout(() => {
    try {
      client?.destroy();
    } catch {
      // ignore
    }
    process.exit(0);
  }, 1500);
}
