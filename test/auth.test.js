import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPasswordRecord,
  verifyPassword,
  authenticateUser,
  isAuthenticated,
  logoutUser,
  requireAdminAuth,
  initPasswordFromEnv,
  ADMIN_COMMANDS,
} from "../src/auth.js";
import { defaultConfig } from "../src/store.js";
import { buildSlashCommands, parseSlashInteraction } from "../src/slash-commands.js";

describe("auth", () => {
  it("creates and verifies password hash", () => {
    const record = createPasswordRecord("test-pass-123");
    const config = defaultConfig();
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;

    assert.equal(verifyPassword("test-pass-123", config), true);
    assert.equal(verifyPassword("wrong", config), false);
  });

  it("session login and logout", () => {
    const config = defaultConfig();
    const record = createPasswordRecord("secret");
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;
    config.auth.sessionHours = 1;

    assert.equal(isAuthenticated("user1", config), false);
    authenticateUser("user1", config);
    assert.equal(isAuthenticated("user1", config), true);

    logoutUser("user1", config);
    assert.equal(isAuthenticated("user1", config), false);
  });

  it("requireAdminAuth accepts password inline", () => {
    const config = defaultConfig();
    const record = createPasswordRecord("mypass");
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;

    const interaction = { user: { id: "u1" } };
    const ok = requireAdminAuth(interaction, config, "mypass");
    assert.equal(ok.ok, true);
    assert.equal(isAuthenticated("u1", config), true);
  });

  it("requireAdminAuth rejects without auth", () => {
    const config = defaultConfig();
    const record = createPasswordRecord("mypass");
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;

    const interaction = { user: { id: "u1" } };
    const result = requireAdminAuth(interaction, config);
    assert.equal(result.ok, false);
    assert.match(result.message, /管理者専用/);
  });

  it("initPasswordFromEnv sets hash once", () => {
    const original = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "env-password";
    try {
      const config = defaultConfig();
      initPasswordFromEnv(config);
      assert.equal(verifyPassword("env-password", config), true);

      config.auth.passwordHash = "locked";
      initPasswordFromEnv(config);
      assert.equal(config.auth.passwordHash, "locked");
    } finally {
      if (original === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = original;
    }
  });

  it("ADMIN_COMMANDS includes refresh and history", () => {
    assert.ok(ADMIN_COMMANDS.has("refresh"));
    assert.ok(ADMIN_COMMANDS.has("history"));
    assert.ok(ADMIN_COMMANDS.has("setting"));
    assert.ok(!ADMIN_COMMANDS.has("status"));
    assert.ok(!ADMIN_COMMANDS.has("members"));
  });
});

describe("slash-commands auth options", () => {
  it("admin commands expose optional password option", () => {
    const commands = buildSlashCommands();
    const adminNames = ["更新", "履歴", "設定", "設定確認", "通知テスト", "監視除外", "監視再開"];

    for (const name of adminNames) {
      const cmd = commands.find((c) => c.name === name);
      assert.ok(cmd, `missing command: ${name}`);
      assert.ok(
        cmd.options?.some((o) => o.name === "パスワード"),
        `${name} should have パスワード option`
      );
    }
  });

  it("parseSlashInteraction passes password for refresh", () => {
    const parsed = parseSlashInteraction({
      commandName: "更新",
      options: {
        getString: (name) => (name === "パスワード" ? "secret" : null),
        getInteger: () => null,
      },
    });
    assert.equal(parsed.command, "refresh");
    assert.equal(parsed.password, "secret");
  });
});
