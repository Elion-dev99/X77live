import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  generateSessionToken,
  createSession,
  validateSession,
  revokeSession,
  cleanupExpiredSessions,
  loadSessions,
  saveSessions,
} from "../src/session-manager.js";

const TEST_DATA_DIR = path.join("test-data-temp", "sessions");

// テスト前後のクリーンアップ
function cleanupTestData() {
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {}
}

describe("session-manager", () => {
  it("generateSessionToken creates random hex strings", () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    assert.equal(token1.length, 64); // 32 bytes * 2 hex
    assert.equal(token2.length, 64);
    assert.notEqual(token1, token2);
    assert.match(token1, /^[a-f0-9]+$/);
  });

  it("createSession stores session with expiry", () => {
    const token = createSession("user123", 8);
    assert.ok(token);
    assert.equal(token.length, 64);

    const validation = validateSession(token);
    assert.equal(validation.valid, true);
    assert.equal(validation.userId, "user123");
  });

  it("validateSession rejects expired tokens", async () => {
    const token = createSession("user456", 0.000001); // very short TTL (3.6ms)
    await new Promise((r) => setTimeout(r, 50)); // wait for expiry

    const validation = validateSession(token);
    assert.equal(validation.valid, false);
  });

  it("validateSession returns false for non-existent tokens", () => {
    const validation = validateSession("nonexistent_token_abc123");
    assert.equal(validation.valid, false);
  });

  it("revokeSession removes session", () => {
    const token = createSession("user789", 8);
    assert.equal(validateSession(token).valid, true);

    revokeSession(token);
    assert.equal(validateSession(token).valid, false);
  });

  it("cleanupExpiredSessions removes old sessions", () => {
    const data = { sessions: {}, lastCleanup: new Date().toISOString() };

    // Add expired and non-expired sessions
    const now = new Date();
    const expired = new Date(now.getTime() - 1000);
    const notExpired = new Date(now.getTime() + 3600000);

    data.sessions.expired_token = {
      userId: "user1",
      expiresAt: expired.toISOString(),
    };
    data.sessions.valid_token = {
      userId: "user2",
      expiresAt: notExpired.toISOString(),
    };

    const removed = cleanupExpiredSessions(data, now);
    assert.equal(removed, 1);
    assert.ok(!data.sessions.expired_token);
    assert.ok(data.sessions.valid_token);
  });

  it("loadSessions and saveSessions persist data", () => {
    cleanupTestData();
    process.env.DATA_DIR = TEST_DATA_DIR;

    try {
      // Save sessions
      const data = {
        sessions: {
          token1: { userId: "user1", expiresAt: new Date().toISOString() },
        },
        lastCleanup: new Date().toISOString(),
      };
      saveSessions(data);

      // Load sessions
      const loaded = loadSessions();
      assert.ok(loaded.sessions.token1);
      assert.equal(loaded.sessions.token1.userId, "user1");
    } finally {
      delete process.env.DATA_DIR;
      cleanupTestData();
    }
  });
});
