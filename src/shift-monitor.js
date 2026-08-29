import { isWithinBusinessHours } from "./business-hours.js";
import { fetchTodayShift } from "./shift-scraper.js";
import { compareShiftWithStatuses, buildShiftMismatchMessage } from "./shift-compare.js";
import { addHistory } from "./store.js";

const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

function shouldNotifyBoy(config, boyId, kind) {
  if (!config.shiftAlertState) config.shiftAlertState = {};
  const key = `${kind}:${boyId}`;
  const last = config.shiftAlertState[key];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= ALERT_COOLDOWN_MS;
}

function markBoyNotified(config, boyId, kind) {
  if (!config.shiftAlertState) config.shiftAlertState = {};
  config.shiftAlertState[`${kind}:${boyId}`] = new Date().toISOString();
}

function filterForNotification(config, result) {
  const scheduledNotOnline = result.scheduledNotOnline.filter((boy) =>
    shouldNotifyBoy(config, boy.boyId, "missing")
  );
  const onlineNotScheduled = result.onlineNotScheduled.filter((boy) =>
    shouldNotifyBoy(config, boy.boyId, "extra")
  );
  return { scheduledNotOnline, onlineNotScheduled };
}

export async function runShiftCheck(config, statuses, client = null, now = new Date()) {
  const settings = config.settings || {};
  if (settings.shiftCheckEnabled === false) {
    return null;
  }
  if (!isWithinBusinessHours(now, settings)) {
    return null;
  }

  const shift = await fetchTodayShift(config, now);
  config.lastShiftFetch = {
    at: now.toISOString(),
    dateKey: shift.dateKey,
    source: shift.source,
    count: shift.boys.length,
  };

  const result = compareShiftWithStatuses(shift.boys, statuses, config, now);
  result.dateKey = shift.dateKey;
  result.source = shift.source;
  config.lastShiftCompare = {
    at: now.toISOString(),
    ...result,
    scheduledCount: shift.boys.length,
  };

  const toNotify = filterForNotification(config, result);
  const hasAlerts =
    toNotify.scheduledNotOnline.length > 0 ||
    toNotify.onlineNotScheduled.length > 0;

  if (
    hasAlerts &&
    client &&
    settings.shiftAlertEnabled !== false
  ) {
    await sendShiftMismatchAlert(client, config, toNotify, shift);
    for (const boy of toNotify.scheduledNotOnline) {
      markBoyNotified(config, boy.boyId, "missing");
    }
    for (const boy of toNotify.onlineNotScheduled) {
      markBoyNotified(config, boy.boyId, "extra");
    }
    addHistory(config, {
      type: "shift_mismatch",
      dateKey: shift.dateKey,
      missing: toNotify.scheduledNotOnline.length,
      extra: toNotify.onlineNotScheduled.length,
      source: shift.source,
    });
  }

  return result;
}

async function sendShiftMismatchAlert(client, config, result, shift) {
  const channelId = config.notifyChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const header = [`📋 シフト照合 (${shift.dateKey}, ${shift.source})`, ""];
    const body = buildShiftMismatchMessage(result, config)
      .split("\n")
      .slice(2)
      .join("\n");

    await channel.send({
      content: [...header, body].join("\n"),
      allowedMentions: { parse: [] },
    });
    console.log(
      `[shift] 不一致通知: 未オンライン${result.scheduledNotOnline.length} / シフト外オンライン${result.onlineNotScheduled.length}`
    );
  } catch (err) {
    console.error("[shift] 通知送信エラー:", err.message);
  }
}
