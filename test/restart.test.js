import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("restart", () => {
  it("scheduleProcessRestart calls process.exit after delay", async () => {
    const { scheduleProcessRestart } = await import("../src/restart.js");

    const originalExit = process.exit;
    const exitMock = mock.fn();
    process.exit = exitMock;

    try {
      scheduleProcessRestart(null, "test");
      assert.equal(exitMock.mock.callCount(), 0);
      await new Promise((resolve) => setTimeout(resolve, 1600));
      assert.equal(exitMock.mock.callCount(), 1);
      assert.deepEqual(exitMock.mock.calls[0].arguments, [0]);
    } finally {
      process.exit = originalExit;
    }
  });
});
