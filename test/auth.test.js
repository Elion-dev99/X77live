import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPasswordRecord,
  verifyPassword,
  authenticateUser,
  isAuthenticated,
  logoutUser,
  requireCustomizeAuth,
  initPasswordFromEnv,
} from "../src/auth.js";
import { defaultConfig } from "../src/store.js";

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

  it("requireCustomizeAuth accepts password inline", () => {
    const config = defaultConfig();
    const record = createPasswordRecord("mypass");
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;

    const interaction = { user: { id: "u1" } };
    const ok = requireCustomizeAuth(interaction, config, "mypass");
    assert.equal(ok.ok, true);
    assert.equal(isAuthenticated("u1", config), true);
  });

  it("requireCustomizeAuth rejects without auth", () => {
    const config = defaultConfig();
    const record = createPasswordRecord("mypass");
    config.auth.passwordSalt = record.passwordSalt;
    config.auth.passwordHash = record.passwordHash;

    const interaction = { user: { id: "u1" } };
    const result = requireCustomizeAuth(interaction, config);
    assert.equal(result.ok, false);
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
});
