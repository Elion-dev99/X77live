import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "../src/store.js";
import { STATUS } from "../src/scraper.js";
import { buildNotificationEmbed } from "../src/format.js";
import { shouldSkipDuplicateNotification } from "../src/notifier.js";

describe("notification dedupe", () => {
  it("shouldSkipDuplicateNotification blocks sends within notify interval", () => {
    const config = defaultConfig();
    config.notifyIntervalMinutes = 10;
    config.lastNotifyAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    assert.equal(shouldSkipDuplicateNotification(config), true);

    config.lastNotifyAt = new Date(Date.now() - 9 * 60 * 1000).toISOString();
    assert.equal(shouldSkipDuplicateNotification(config), false);
  });

  it("buildNotificationEmbed includes online-not-scheduled in periodic embed", () => {
    const config = defaultConfig();
    config.boyStatuses = {
      "1": { name: "しずる", status: STATUS.WAITING, updatedAt: new Date().toISOString() },
    };
    config.lastSummary = { total: 1, waiting: 1, inCall: 0, offline: 0 };
    config.lastShiftCompare = {
      scheduledNotOnline: [],
      onlineNotScheduled: [{ boyId: "1", name: "しずる", status: STATUS.WAITING }],
    };

    const embed = buildNotificationEmbed(config);
    assert.ok(embed.data.description.includes("シフト外オンライン"));
    const field = (embed.data.fields || []).find((f) =>
      f.name.includes("シフト外オンライン")
    );
    assert.ok(field);
    assert.ok(field.value.includes("しずる"));
  });
});
