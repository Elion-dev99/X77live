import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { shouldRunScheduledMonitoring } from "../src/business-hours.js";
import { defaultConfig } from "../src/store.js";

function jstDate(y, m, d, h, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

describe("monitor business hours", () => {
  const settings = {
    businessHoursOpen: "13:00",
    businessHoursClose: "01:00",
    monitorBusinessHoursOnly: true,
  };

  it("shouldRunScheduledMonitoring is false outside 13:00-01:00 JST", () => {
    assert.equal(
      shouldRunScheduledMonitoring(jstDate(2026, 8, 29, 10, 0), settings),
      false
    );
    assert.equal(
      shouldRunScheduledMonitoring(jstDate(2026, 8, 29, 12, 59), settings),
      false
    );
    assert.equal(
      shouldRunScheduledMonitoring(jstDate(2026, 8, 29, 13, 0), settings),
      true
    );
    assert.equal(
      shouldRunScheduledMonitoring(jstDate(2026, 8, 29, 0, 30), settings),
      true
    );
    assert.equal(
      shouldRunScheduledMonitoring(jstDate(2026, 8, 29, 1, 0), settings),
      false
    );
  });

  it("shouldRunScheduledMonitoring respects monitorBusinessHoursOnly=false", () => {
    assert.equal(
      shouldRunScheduledMonitoring(jstDate(2026, 8, 29, 10, 0), {
        ...settings,
        monitorBusinessHoursOnly: false,
      }),
      true
    );
  });

  it("defaultConfig enables monitorBusinessHoursOnly by default", () => {
    const config = defaultConfig();
    assert.equal(config.settings.monitorBusinessHoursOnly, true);
  });

  it("runScrape skips scheduled scrape outside business hours", async () => {
    const { runScrape } = await import("../src/monitor.js");
    const config = defaultConfig();
    config.settings.monitorBusinessHoursOnly = true;

    const getConfig = () => config;
    const persistConfig = mock.fn();

    const result = await runScrape(getConfig, persistConfig, null, {
      now: jstDate(2026, 8, 29, 10, 0),
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "outside_business_hours");
    assert.equal(persistConfig.mock.callCount(), 0);
  });
});
