import { applySetting } from "./config.js";
import {
  loadConfig as getStoreConfig,
  saveConfig,
  addHistory,
} from "./store.js";
import {
  listDailyReportFiles,
  getLatestSessionKey,
  normalizeSessionKey,
  resolveReportDownload,
  loadReportDocument,
  buildInterimReportFiles,
  buildDailyReportDocument,
} from "./daily-report-files.js";
import { runShiftCheck } from "./shift-monitor.js";
import { getCurrentBusinessDayStats } from "./daily-stats.js";
import { fetchTodayShift } from "./shift-scraper.js";
import { compareShiftWithStatuses } from "./shift-compare.js";
import { restoreConfigFromBackup, listConfigBackups } from "./config-backup.js";
import {
  buildStatusEmbed,
  buildNotificationEmbed,
  buildMemberListEmbed,
  buildSettingsEmbed,
  buildHistoryEmbed,
  buildReportListEmbed,
  buildDailySummaryEmbed,
  buildShiftCheckEmbed,
} from "./format.js";
import { sendPeriodicNotification, restartNotifier } from "./notifier.js";
import { runScrape, restartMonitor } from "./monitor.js";
import {
  requireAdminAuth,
  ADMIN_COMMANDS,
  verifyPassword,
  authenticateUser,
  logoutUser,
  createPasswordRecord,
  isAuthenticated,
  getSessionExpiry,
  isPasswordConfigured,
} from "./auth.js";
import { sendAdminDirectMessage, sendAdminErrorMessage } from "./admin-notify.js";
import { renderDailyRankingChart, buildDailyChartDmCaption } from "./chart-report.js";

let configCache = null;
let clientRef = null;

export function initCommands(client) {
  clientRef = client;
  configCache = getStoreConfig();
}
export function getConfig() {
  if (!configCache) configCache = getStoreConfig();
  return configCache;
}
export function persistConfig() {
  saveConfig(configCache);
}
export function reloadConfig() {
  configCache = getStoreConfig();
  return configCache;
}

function authError(result) {
  return { type: "text", content: result.message, ephemeral: true };
}
function checkAdminAuth(interaction, password) {
  const result = requireAdminAuth(interaction, getConfig(), password);
  if (!result.ok) return authError(result);
  persistConfig();
  return null;
}
function needsAdminAuth(command) {
  return ADMIN_COMMANDS.has(command) && command !== "change_password";
}

export async function handleCommand(interaction, parsed) {
  const config = getConfig();
  if (needsAdminAuth(parsed.command)) {
    const denied = checkAdminAuth(interaction, parsed.password);
    if (denied) return denied;
  }

  switch (parsed.command) {
    case "status":
      return { type: "embed", embed: buildStatusEmbed(config) };
    case "members":
      return { type: "embed", embed: buildMemberListEmbed(config) };
    case "history":
      return { type: "embed", embed: buildHistoryEmbed(config, parsed.limit), ephemeral: true };

    case "refresh": {
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await runScrape(getConfig, persistConfig, clientRef, { force: true });
        const s = result.summary;
        return {
          type: "deferred", interaction,
          content: `✅ x77.jp から最新データを取得しました\n🟢 待機中: **${s.waiting}** / 📞 通話中: **${s.inCall}** / ⚪ オフライン: **${s.offline}**`,
          embed: buildStatusEmbed(getConfig()), ephemeral: true,
        };
      } catch (err) {
        return { type: "deferred", interaction, content: `⚠️ 取得失敗: ${err.message}`, ephemeral: true };
      }
    }

    case "login": {
      if (!isPasswordConfigured(config)) return { type: "text", content: "⚠️ 管理パスワードが未設定です。環境変数 `ADMIN_PASSWORD` を設定してください。", ephemeral: true };
      if (!verifyPassword(parsed.password, config)) return { type: "text", content: "⚠️ パスワードが正しくありません。", ephemeral: true };
      authenticateUser(interaction.user.id, config);
      persistConfig();
      const expires = getSessionExpiry(interaction.user.id, config);
      const time = expires ? new Date(expires).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : "後ほど";
      return { type: "text", content: `✅ 認証しました（有効期限: ${time} まで）\n管理者コマンドが使えます。`, ephemeral: true };
    }

    case "logout":
      logoutUser(interaction.user.id, config);
      persistConfig();
      return { type: "text", content: "✅ ログアウトしました。", ephemeral: true };

    case "change_password": {
      if (!isPasswordConfigured(config)) return { type: "text", content: "⚠️ 管理パスワードが未設定です。", ephemeral: true };
      if (!verifyPassword(parsed.currentPassword, config)) return { type: "text", content: "⚠️ 現在のパスワードが正しくありません。", ephemeral: true };
      if (!parsed.newPassword || parsed.newPassword.length < 4) return { type: "text", content: "⚠️ 新しいパスワードは4文字以上にしてください。", ephemeral: true };
      const record = createPasswordRecord(parsed.newPassword);
      config.auth.passwordSalt = record.passwordSalt;
      config.auth.passwordHash = record.passwordHash;
      config.auth.sessions = {};
      authenticateUser(interaction.user.id, config);
      persistConfig();
      return { type: "text", content: "✅ パスワードを変更しました。全セッションをリセットしました。", ephemeral: true };
    }

    case "exclude_boy": {
      const boyId = parsed.boyId;
      if (!config.boys[boyId] && !config.boyStatuses[boyId]) return { type: "text", content: "⚠️ この boy_id は見つかりません。", ephemeral: true };
      if (!config.boys[boyId]) config.boys[boyId] = { name: config.boyStatuses[boyId]?.name || boyId, excluded: true };
      else config.boys[boyId].excluded = true;
      const name = config.boys[boyId].name;
      delete config.boyStatuses[boyId];
      addHistory(config, { type: "boy_exclude", boyId, name });
      persistConfig();
      return { type: "text", content: `✅ **${name}** (ID: ${boyId}) を監視対象から除外しました。`, ephemeral: true };
    }

    case "include_boy": {
      const boyId = parsed.boyId;
      if (!config.boys[boyId]) return { type: "text", content: "⚠️ この boy_id は見つかりません。", ephemeral: true };
      config.boys[boyId].excluded = false;
      addHistory(config, { type: "boy_include", boyId, name: config.boys[boyId].name });
      persistConfig();
      await runScrape(getConfig, persistConfig, clientRef, { force: true });
      return { type: "text", content: `✅ **${config.boys[boyId].name}** (ID: ${boyId}) を監視対象に再追加しました。`, ephemeral: true };
    }

    case "setting": {
      let value = parsed.value;
      if (parsed.key === "notifyChannel") {
        const match = value.match(/^<#(\d+)>$/) || value.match(/^(\d+)$/);
        if (!match) return { type: "text", content: "⚠️ チャンネルID または <#チャンネルID> 形式で指定してください。", ephemeral: true };
        value = match[1];
      }
      if (parsed.key === "mentionRole") {
        const match = value.match(/^<@&(\d+)>$/) || value.match(/^(\d+)$/);
        if (!match) return { type: "text", content: "⚠️ ロールID または <@&ロールID> 形式で指定してください。", ephemeral: true };
        value = match[1];
      }
      const result = applySetting(config, parsed.key, value);
      if (!result.ok) return { type: "text", content: `⚠️ ${result.error}`, ephemeral: true };
      persistConfig();
      if ((parsed.key === "notifyInterval" || parsed.key === "notifyEnabled") && clientRef) restartNotifier(clientRef, getConfig, persistConfig, buildNotificationEmbed);
      if (parsed.key === "pollInterval" && clientRef) restartMonitor(clientRef, getConfig, persistConfig);
      return { type: "text", content: `✅ 設定を更新しました: **${parsed.key}** = \`${value}\``, ephemeral: true };
    }

    case "settings_show":
      return { type: "embed", embed: buildSettingsEmbed(config), ephemeral: true };

    case "notify_test": {
      await interaction.deferReply({ ephemeral: true });
      const dmSent = await sendAdminDirectMessage(clientRef, config, ["✅ **管理者DMテスト送信**", "", `時刻: ${new Date().toISOString()}`, "管理者DM通知は正常に動作しています。"].join("\n"));
      if (clientRef) await sendPeriodicNotification(getConfig, persistConfig, buildNotificationEmbed, { force: true });
      return { type: "deferred", interaction, content: dmSent ? "✅ 通知テストと管理者DMテストを送信しました。" : "⚠️ 管理者DMを送信できませんでした。ADMIN_USER_IDを確認してください。", ephemeral: true };
    }

    case "error_test": {
      await interaction.deferReply({ ephemeral: true });
      const sent = await sendAdminErrorMessage(clientRef, config, new Error("これはエラー通知テストです（実際の障害ではありません）"), "error notification test");
      return { type: "deferred", interaction, content: sent ? "✅ エラー通知テストを管理者DMへ送信しました。" : "⚠️ エラー通知テストのDM送信に失敗しました。", ephemeral: true };
    }

    case "restore_config": {
      const backupName = parsed.backupName?.trim() || "latest";
      const restored = restoreConfigFromBackup(backupName);
      if (!restored.ok) return { type: "text", content: `⚠️ 復元に失敗しました: ${restored.error}`, ephemeral: true };
      reloadConfig();
      restartMonitor(clientRef, getConfig, persistConfig);
      const recent = listConfigBackups(3).map((item) => `\`${item.name}\``).join(" / ");
      return { type: "text", content: ["✅ **config.json をバックアップから復元しました。**", `使用ファイル: \`${backupName === "latest" ? "config-latest.json" : backupName}\``, "", "監視ループを再起動しました。", recent ? `直近バックアップ: ${recent}` : ""].filter(Boolean).join("\n"), ephemeral: true };
    }

    case "restart_server":
      addHistory(config, { type: "bot_restart", userId: interaction.user.id, userTag: interaction.user.tag });
      persistConfig();
      return { type: "restart", content: "🔄 Bot サーバーを再起動します。数十秒後にオンラインに戻ります。", ephemeral: true, reason: `user:${interaction.user.id}` };

    case "report_list": {
      const reports = listDailyReportFiles().slice(-parsed.limit).reverse();
      return { type: "embed", embed: buildReportListEmbed(config, reports), ephemeral: true };
    }

    case "report_download": {
      let sessionKey = normalizeSessionKey(parsed.sessionKey);
      if (!sessionKey && !parsed.sessionKey) sessionKey = getLatestSessionKey();
      if (!sessionKey) return { type: "text", content: "⚠️ 保存済みのレポートがありません。", ephemeral: true };
      const resolved = resolveReportDownload(sessionKey, parsed.format || "both");
      if (!resolved) return { type: "text", content: `⚠️ **${sessionKey}** のレポートが見つかりません。`, ephemeral: true };
      const report = loadReportDocument(resolved.sessionKey);
      return { type: "files", content: `📁 営業日 **${resolved.sessionKey}**\nオンライン稼働: **${report?.onlineCount ?? "—"}** 名`, files: resolved.files, ephemeral: true };
    }

    case "report_interim": {
      await interaction.deferReply({ ephemeral: true });
      try {
        await runScrape(getConfig, persistConfig, clientRef);
        const current = getCurrentBusinessDayStats(getConfig(), new Date());
        if (!current.ok) return { type: "deferred", interaction, content: "⚠️ 現在は営業時間外です。", ephemeral: true };
        const embed = buildDailySummaryEmbed(getConfig(), current.stats, { interim: true, asOf: new Date() });
        if ((parsed.format || "view") === "view") return { type: "deferred", interaction, embed, ephemeral: true };
        const interim = buildInterimReportFiles(getConfig(), current.stats, parsed.format, new Date());
        return { type: "deferred", interaction, content: `📊 営業日 **${current.stats.sessionKey}** の途中経過レポート（暫定）`, embed, files: interim.files, ephemeral: true };
      } catch (err) {
        return { type: "deferred", interaction, content: `⚠️ レポート生成中にエラーが発生しました: ${err.message}`, ephemeral: true };
      }
    }

    case "shift_check": {
      await interaction.deferReply({ ephemeral: true });
      await runScrape(getConfig, persistConfig, clientRef, { force: true });
      const configNow = getConfig();
      const statuses = Object.entries(configNow.boyStatuses || {}).map(([boyId, info]) => ({ boyId, ...info }));
      const shift = await fetchTodayShift(configNow);
      const result = compareShiftWithStatuses(shift.boys, statuses, configNow);
      result.dateKey = shift.dateKey;
      result.source = shift.source;
      result.scheduledCount = shift.boys.length;
      configNow.lastShiftFetch = { at: new Date().toISOString(), dateKey: shift.dateKey, source: shift.source, count: shift.boys.length };
      configNow.lastShiftCompare = { at: new Date().toISOString(), ...result, scheduledCount: shift.boys.length };
      persistConfig();
      return { type: "deferred", interaction, content: `📋 **${shift.dateKey}** のシフト照合（ソース: ${shift.source}）`, embed: buildShiftCheckEmbed(configNow, result), ephemeral: true };
    }

    case "report_chart": {
      await interaction.deferReply({ ephemeral: true });
      try {
        let sessionKey = normalizeSessionKey(parsed.sessionKey);
        let report;
        if (sessionKey) report = loadReportDocument(sessionKey);
        else {
          const current = getCurrentBusinessDayStats(getConfig(), new Date());
          if (current.ok) report = buildDailyReportDocument(getConfig(), current.stats);
          else { sessionKey = getLatestSessionKey(); report = sessionKey ? loadReportDocument(sessionKey) : null; }
        }
        if (!report) return { type: "deferred", interaction, content: "⚠️ 送信できるレポートがありません。", ephemeral: true };
        const chart = await renderDailyRankingChart(report);
        const sent = await sendAdminDirectMessage(clientRef, getConfig(), buildDailyChartDmCaption(report), chart ? { files: [{ attachment: chart.buffer, name: chart.filename }] } : {});
        return { type: "deferred", interaction, content: sent ? `✅ 稼働グラフを管理者DMに送信しました（営業日 **${report.sessionKey}**）。` : "⚠️ 管理者DMの送信に失敗しました。", ephemeral: true };
      } catch (err) {
        return { type: "deferred", interaction, content: `⚠️ グラフ送信に失敗しました: ${err.message}`, ephemeral: true };
      }
    }

    case "help":
      return { type: "text", content: "`/状況` `/一覧` `/更新` `/通知テスト` `/エラー通知テスト` `/設定確認` `/ヘルプ`", ephemeral: true };
    default:
      return { type: "text", content: "⚠️ 不明なコマンドです。", ephemeral: true };
  }
}

export function isUserAuthenticated(userId) {
  return isAuthenticated(userId, getConfig());
}
