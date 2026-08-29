import { getJstParts } from "./business-hours.js";
import { isOnlineStatus } from "./format.js";
import { STATUS } from "./scraper.js";

function parseClockToMinutes(text) {
  const [h, m = "0"] = text.trim().split(":");
  return Number(h) * 60 + Number(m);
}

/** シフト時刻未定（要問合せ等）— 未オンライン通知の対象外 */
export function isInquiryShiftTime(shiftTime) {
  if (!shiftTime) return false;
  return /要問/i.test(String(shiftTime));
}

/**
 * @param {string} shiftTime e.g. "13:00～21:00", "13:00～LAST", "要問合せ"
 * @param {Date} now
 * @param {object} settings
 */
export function isWithinShiftWindow(shiftTime, now = new Date(), settings = {}) {
  const { hour, minute } = getJstParts(now);
  const nowMinutes = hour * 60 + minute;

  if (!shiftTime || shiftTime.includes("要問合せ")) {
    const open = parseClockToMinutes(settings.businessHoursOpen || "13:00");
    const close = parseClockToMinutes(settings.businessHoursClose || "01:00");
    if (open < close) return nowMinutes >= open && nowMinutes < close;
    return nowMinutes >= open || nowMinutes < close;
  }

  const match = shiftTime.match(/(\d{1,2}:\d{2})\s*[〜～~－-]\s*(LAST|(\d{1,2}:\d{2}))/i);
  if (!match) return true;

  const start = parseClockToMinutes(match[1]);
  let end;
  if (match[2].toUpperCase() === "LAST") {
    end = parseClockToMinutes(settings.businessHoursClose || "01:00");
    if (end <= start) {
      return nowMinutes >= start || nowMinutes < end;
    }
  } else {
    end = parseClockToMinutes(match[3]);
  }

  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  return nowMinutes >= start || nowMinutes < end;
}

export function hasShiftStarted(shiftTime, now = new Date(), graceMinutes = 0) {
  if (!shiftTime || shiftTime.includes("要問合せ")) return true;
  const match = shiftTime.match(/(\d{1,2}:\d{2})/);
  if (!match) return true;
  const { hour, minute } = getJstParts(now);
  const nowMinutes = hour * 60 + minute;
  return nowMinutes >= parseClockToMinutes(match[1]) + graceMinutes;
}

/**
 * @param {Array<{ boyId: string, name: string, shiftTime: string }>} scheduledBoys
 * @param {Array<{ boyId: string, name: string, status: string }>} statuses
 * @param {object} config
 * @param {Date} [now]
 */
export function compareShiftWithStatuses(scheduledBoys, statuses, config, now = new Date()) {
  const settings = config.settings || {};
  const grace = Number(settings.shiftGraceMinutes) || 15;
  const scheduledMap = new Map(scheduledBoys.map((b) => [b.boyId, b]));
  const statusMap = new Map(statuses.map((b) => [b.boyId, b]));

  /** @type {Array<object>} */
  const scheduledNotOnline = [];
  /** @type {Array<object>} */
  const onlineNotScheduled = [];

  for (const scheduled of scheduledBoys) {
    if (config.boys?.[scheduled.boyId]?.excluded) continue;
    if (isInquiryShiftTime(scheduled.shiftTime)) continue;
    if (!isWithinShiftWindow(scheduled.shiftTime, now, settings)) continue;
    if (!hasShiftStarted(scheduled.shiftTime, now, grace)) continue;

    const live = statusMap.get(scheduled.boyId);
    const status = live?.status || STATUS.OFFLINE;
    if (!isOnlineStatus(status)) {
      scheduledNotOnline.push({
        boyId: scheduled.boyId,
        name: scheduled.name,
        shiftTime: scheduled.shiftTime,
        status,
      });
    }
  }

  for (const live of statuses) {
    if (config.boys?.[live.boyId]?.excluded) continue;
    if (!isOnlineStatus(live.status)) continue;
    if (scheduledMap.has(live.boyId)) continue;
    onlineNotScheduled.push({
      boyId: live.boyId,
      name: live.name,
      status: live.status,
    });
  }

  return { scheduledNotOnline, onlineNotScheduled };
}

export function buildShiftMismatchMessage(result, config) {
  const lines = [`📋 **シフト照合** (${config.storeName})`, ""];

  if (
    result.scheduledNotOnline.length === 0 &&
    result.onlineNotScheduled.length === 0
  ) {
    lines.push("現在、シフトとオンライン状態の不一致はありません。");
    return lines.join("\n");
  }

  if (result.scheduledNotOnline.length > 0) {
    lines.push("🚨 **出勤シフトなのにオンラインしていない**");
    for (const boy of result.scheduledNotOnline.slice(0, 20)) {
      lines.push(`• **${boy.name}** (${boy.shiftTime}) — ${boy.status}`);
    }
    lines.push("");
  }

  if (result.onlineNotScheduled.length > 0) {
    lines.push("⚠️ **シフト未登録なのにオンライン中**");
    for (const boy of result.onlineNotScheduled.slice(0, 20)) {
      lines.push(`• **${boy.name}** — ${boy.status}`);
    }
  }

  return lines.join("\n").slice(0, 1900);
}
