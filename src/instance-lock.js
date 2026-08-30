import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";

const LOCK_FILE = path.join(DATA_DIR, "bot.instance.lock");

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    const lock = readLock();
    if (lock?.pid === process.pid) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // ignore
  }
}

/**
 * Bot 二重起動防止（同一 DATA_DIR で別プロセスが生きていれば false）
 */
export function acquireInstanceLock() {
  try {
    const existing = readLock();
    if (existing?.pid && existing.pid !== process.pid && isProcessAlive(existing.pid)) {
      console.error(
        `[boot] 別の Bot インスタンス (PID ${existing.pid}, 起動 ${existing.startedAt || "不明"}) が稼働中のため終了します`
      );
      return false;
    }

    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }),
      "utf8"
    );

    process.on("exit", releaseLock);

    return true;
  } catch (err) {
    console.warn("[boot] instance lock 取得失敗（続行）:", err.message);
    return true;
  }
}
