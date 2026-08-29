const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getJstParts(date = new Date()) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
  };
}

export function formatDateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarDays(year, month, day, delta) {
  const utc = Date.UTC(year, month - 1, day + delta);
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function parseTimeToMinutes(time) {
  const [h, m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * 営業時間 13:00 〜 翌 01:00（JST）
 */
export function isWithinBusinessHours(date = new Date(), settings = {}) {
  const open = parseTimeToMinutes(settings.businessHoursOpen || "13:00");
  const close = parseTimeToMinutes(settings.businessHoursClose || "01:00");
  const { hour, minute } = getJstParts(date);
  const now = hour * 60 + minute;

  if (open < close) {
    return now >= open && now < close;
  }

  return now >= open || now < close;
}

/** 定期監視・定期通知を実行してよいか（営業時間外は false） */
export function shouldRunScheduledMonitoring(date = new Date(), settings = {}) {
  if (settings.monitorBusinessHoursOnly === false) return true;
  return isWithinBusinessHours(date, settings);
}

/**
 * 営業開始日（YYYY-MM-DD）。00:00〜00:59 は前日開始の営業に属する。
 */
export function getBusinessSessionKey(date = new Date(), settings = {}) {
  const { year, month, day, hour } = getJstParts(date);
  const close = parseTimeToMinutes(settings.businessHoursClose || "01:00");
  const closeHour = Math.floor(close / 60);

  if (hour < closeHour) {
    const prev = addCalendarDays(year, month, day, -1);
    return formatDateKey(prev);
  }

  const open = parseTimeToMinutes(settings.businessHoursOpen || "13:00");
  const openHour = Math.floor(open / 60);
  if (hour >= openHour) {
    return formatDateKey({ year, month, day });
  }

  return null;
}

/** 01:00 送信時に集計する、終了した営業日キー */
export function getEndedSessionKey(date = new Date(), settings = {}) {
  const summaryAt = parseTimeToMinutes(settings.dailySummaryAt || "01:00");
  const summaryHour = Math.floor(summaryAt / 60);
  const { year, month, day, hour } = getJstParts(date);

  if (hour !== summaryHour) return null;

  const prev = addCalendarDays(year, month, day, -1);
  return formatDateKey(prev);
}

export function formatSessionPeriod(sessionKey, settings = {}) {
  const [y, m, d] = sessionKey.split("-").map(Number);
  const next = addCalendarDays(y, m, d, 1);
  const open = settings.businessHoursOpen || "13:00";
  const close = settings.businessHoursClose || "01:00";
  return `${m}/${d} ${open} 〜 ${next.month}/${next.day} ${close}`;
}

export function formatDurationMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) return `${hours}時間${mins}分`;
  if (hours > 0) return `${hours}時間`;
  return `${mins}分`;
}

export function shouldSendDailySummaryNow(date = new Date(), settings = {}) {
  const summaryAt = parseTimeToMinutes(settings.dailySummaryAt || "01:00");
  const summaryHour = Math.floor(summaryAt / 60);
  const summaryMinute = summaryAt % 60;
  const { hour, minute } = getJstParts(date);

  if (hour !== summaryHour) return false;
  return minute >= summaryMinute && minute < summaryMinute + 5;
}

/** sessionKey (YYYY-MM-DD) の曜日。0=日曜 */
export function getSessionKeyDayOfWeek(sessionKey) {
  const [y, m, d] = sessionKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isSundaySessionKey(sessionKey) {
  return getSessionKeyDayOfWeek(sessionKey) === 0;
}

/** 月曜〜日曜の7営業日キー（末尾が weekEndSessionKey） */
export function getWeekSessionKeys(weekEndSessionKey) {
  const [y, m, d] = weekEndSessionKey.split("-").map(Number);
  const keys = [];
  for (let delta = -6; delta <= 0; delta += 1) {
    keys.push(formatDateKey(addCalendarDays(y, m, d, delta)));
  }
  return keys;
}

export function formatWeekPeriod(weekStart, weekEnd, settings = {}) {
  const open = settings.businessHoursOpen || "13:00";
  const close = settings.businessHoursClose || "01:00";
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  const endNext = addCalendarDays(ey, em, ed, 1);
  return `${sm}/${sd} ${open} 〜 ${endNext.month}/${endNext.day} ${close}（月〜日）`;
}
