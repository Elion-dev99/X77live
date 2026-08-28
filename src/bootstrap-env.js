import dotenv from "dotenv";
import fs from "node:fs";
import { isSandboxMode } from "./env-mode.js";

const sandboxEnvFile = process.env.SANDBOX_ENV_FILE || ".env.sandbox";

if (isSandboxMode()) {
  if (fs.existsSync(sandboxEnvFile)) {
    dotenv.config({ path: sandboxEnvFile, override: true });
    console.log(`[boot] loaded sandbox env: ${sandboxEnvFile}`);
  } else {
    console.warn(
      `[warn] BOT_MODE=sandbox ですが ${sandboxEnvFile} がありません。.env を使用します`
    );
    dotenv.config();
  }
} else {
  dotenv.config();
}

if (isSandboxMode()) {
  if (!process.env.DATA_DIR?.trim()) {
    process.env.DATA_DIR = "data-sandbox";
  }
  if (process.env.NOTIFY_ENABLED === undefined) {
    process.env.NOTIFY_ENABLED = "false";
  }
  if (process.env.SANDBOX_DISABLE_PING === "true") {
    process.env.PING_ON_STATUS_CHANGE = "false";
  } else if (process.env.PING_ON_STATUS_CHANGE === undefined) {
    process.env.PING_ON_STATUS_CHANGE = "false";
  }
  const storeName = process.env.STORE_NAME?.trim();
  if (!storeName || !storeName.includes("SANDBOX")) {
    process.env.STORE_NAME = storeName
      ? `${storeName} [SANDBOX]`
      : "大阪店 [SANDBOX]";
  }
}
