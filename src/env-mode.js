/** @returns {boolean} */
export function isSandboxMode() {
  return process.env.BOT_MODE?.trim().toLowerCase() === "sandbox";
}

export function getBotModeLabel() {
  return isSandboxMode() ? "sandbox" : "production";
}
