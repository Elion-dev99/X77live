import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./store.js";

function pathsForDataDir(dataDir = DATA_DIR) {
  const backupsDir = path.join(dataDir, "backups");
  return {
    backupsDir,
    configFile: path.join(dataDir, "config.json"),
    latestBackup: path.join(backupsDir, "config-latest.json"),
  };
}

export const BACKUPS_DIR = pathsForDataDir().backupsDir;

function getBackupIntervalMs(config) {
  const hours = Number(config.settings?.configBackupIntervalHours);
  if (!Number.isFinite(hours) || hours <= 0) return 3 * 60 * 60 * 1000;
  return hours * 60 * 60 * 1000;
}

export function shouldBackupConfig(config, now = new Date()) {
  if (config.settings?.configBackupEnabled === false) return false;
  const last = config.lastConfigBackupAt
    ? new Date(config.lastConfigBackupAt).getTime()
    : 0;
  return now.getTime() - last >= getBackupIntervalMs(config);
}

export function backupConfigSnapshot(config, now = new Date(), dataDir = DATA_DIR) {
  const { backupsDir, latestBackup } = pathsForDataDir(dataDir);
  fs.mkdirSync(backupsDir, { recursive: true });

  const payload = JSON.stringify(config, null, 2);
  fs.writeFileSync(latestBackup, payload, "utf8");

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const stampedPath = path.join(backupsDir, `config-${stamp}.json`);
  fs.writeFileSync(stampedPath, payload, "utf8");

  config.lastConfigBackupAt = now.toISOString();
  console.log(`[config-backup] 保存: ${path.basename(stampedPath)}`);
  return { latestPath: latestBackup, stampedPath };
}

export function maybeBackupConfig(config, now = new Date(), dataDir = DATA_DIR) {
  if (!shouldBackupConfig(config, now)) return null;
  return backupConfigSnapshot(config, now, dataDir);
}

export function listConfigBackups(limit = 10, dataDir = DATA_DIR) {
  const { backupsDir } = pathsForDataDir(dataDir);
  fs.mkdirSync(backupsDir, { recursive: true });
  const files = fs
    .readdirSync(backupsDir)
    .filter((name) => name.startsWith("config-") && name.endsWith(".json"))
    .sort()
    .reverse();
  return files.slice(0, limit).map((name) => ({
    name,
    path: path.join(backupsDir, name),
  }));
}

export function resolveConfigBackupPath(name, dataDir = DATA_DIR) {
  const { backupsDir, latestBackup } = pathsForDataDir(dataDir);
  if (!name || name === "latest") return latestBackup;
  const base = path.basename(name);
  if (!/^config[-\w.]+\.json$/.test(base)) return null;
  const resolved = path.resolve(backupsDir, base);
  if (!resolved.startsWith(path.resolve(backupsDir) + path.sep)) return null;
  return fs.existsSync(resolved) ? resolved : null;
}

export function restoreConfigFromBackup(backupName = "latest", dataDir = DATA_DIR) {
  const backupPath = resolveConfigBackupPath(backupName, dataDir);
  const { configFile } = pathsForDataDir(dataDir);
  if (!backupPath) {
    return { ok: false, error: "バックアップファイルが見つかりません。" };
  }

  try {
    const raw = fs.readFileSync(backupPath, "utf8");
    JSON.parse(raw);
    fs.writeFileSync(configFile, raw, "utf8");
    console.log(`[config-backup] 復元: ${path.basename(backupPath)}`);
    return { ok: true, path: backupPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

let backupHandle = null;

export function startConfigBackupScheduler(getConfig, persistConfig) {
  stopConfigBackupScheduler();

  backupHandle = setInterval(() => {
    const config = getConfig();
    const saved = maybeBackupConfig(config);
    if (saved) persistConfig();
  }, 60 * 1000);

  const config = getConfig();
  const saved = maybeBackupConfig(config);
  if (saved) persistConfig();

  const hours = config.settings?.configBackupIntervalHours || 3;
  console.log(`[config-backup] 自動バックアップを開始 (${hours}時間間隔)`);
}

export function stopConfigBackupScheduler() {
  if (backupHandle) {
    clearInterval(backupHandle);
    backupHandle = null;
  }
}
