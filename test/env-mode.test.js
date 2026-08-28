import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSandboxMode, getBotModeLabel } from "../src/env-mode.js";

describe("env-mode", () => {
  it("isSandboxMode detects BOT_MODE=sandbox", () => {
    const original = process.env.BOT_MODE;
    process.env.BOT_MODE = "sandbox";
    try {
      assert.equal(isSandboxMode(), true);
      assert.equal(getBotModeLabel(), "sandbox");
    } finally {
      if (original === undefined) delete process.env.BOT_MODE;
      else process.env.BOT_MODE = original;
    }
  });

  it("isSandboxMode is false by default", () => {
    const original = process.env.BOT_MODE;
    delete process.env.BOT_MODE;
    try {
      assert.equal(isSandboxMode(), false);
      assert.equal(getBotModeLabel(), "production");
    } finally {
      if (original === undefined) delete process.env.BOT_MODE;
      else process.env.BOT_MODE = original;
    }
  });
});
