import { isWithinBusinessHours } from "./business-hours.js";
import { fetchTodayShift } from "./shift-scraper.js";
import { compareShiftWithStatuses } from "./shift-compare.js";

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

  return result;
}
