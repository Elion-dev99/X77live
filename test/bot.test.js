import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  startSession,
  endSession,
  isOnline,
  getOnlineMembers,
  getOfflineMembers,
  getOrCreateMember,
} from "../src/store.js";
import { applySetting, isInQuietHours, getNestedValue, setNestedValue } from "../src/config.js";
import { buildStatusEmbed } from "../src/format.js";

describe("store", () => {
  it("defaultConfig has Osaka store name", () => {
    const config = defaultConfig();
    assert.equal(config.storeName, "大阪店");
    assert.equal(config.notifyIntervalMinutes, 10);
    assert.equal(config.notifyEnabled, true);
  });

  it("startSession and endSession work", () => {
    const config = defaultConfig();
    getOrCreateMember(config, "user1", "太郎");
    assert.equal(isOnline(config, "user1"), false);

    startSession(config, "user1", "配信A");
    assert.equal(isOnline(config, "user1"), true);
    assert.equal(config.sessions.user1.note, "配信A");

    const result = endSession(config, "user1");
    assert.equal(isOnline(config, "user1"), false);
    assert.ok(result.durationMs >= 0);
    assert.equal(config.history.length, 2);
  });

  it("getOnlineMembers and getOfflineMembers", () => {
    const config = defaultConfig();
    getOrCreateMember(config, "u1", "太郎");
    getOrCreateMember(config, "u2", "花子");
    startSession(config, "u1");

    assert.equal(getOnlineMembers(config).length, 1);
    assert.equal(getOfflineMembers(config).length, 1);
    assert.equal(getOnlineMembers(config)[0].name, "太郎");
    assert.equal(getOfflineMembers(config)[0].name, "花子");
  });
});

describe("config", () => {
  it("applySetting updates notify interval", () => {
    const config = defaultConfig();
    const result = applySetting(config, "notifyInterval", "15");
    assert.equal(result.ok, true);
    assert.equal(config.notifyIntervalMinutes, 15);
  });

  it("applySetting rejects invalid interval", () => {
    const config = defaultConfig();
    const result = applySetting(config, "notifyInterval", "0");
    assert.equal(result.ok, false);
  });

  it("nested value get/set", () => {
    const obj = { settings: { showDuration: true } };
    assert.equal(getNestedValue(obj, "settings.showDuration"), true);
    setNestedValue(obj, "settings.showDuration", false);
    assert.equal(obj.settings.showDuration, false);
  });

  it("isInQuietHours detects quiet period", () => {
    const config = defaultConfig();
    config.settings.quietHoursStart = "02:00";
    config.settings.quietHoursEnd = "06:00";
    // Just verify it doesn't throw
    const result = isInQuietHours(config);
    assert.equal(typeof result, "boolean");
  });
});

describe("format", () => {
  it("buildStatusEmbed creates valid embed", () => {
    const config = defaultConfig();
    getOrCreateMember(config, "u1", "太郎");
    getOrCreateMember(config, "u2", "花子");
    startSession(config, "u1", "夜勤");

    const embed = buildStatusEmbed(config);
    assert.ok(embed.data.title.includes("大阪店"));
    assert.ok(embed.data.fields.length >= 2);
  });
});
