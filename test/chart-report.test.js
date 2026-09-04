import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyRankingChartConfig,
  buildChartRequestFromReport,
  buildDailyChartDmCaption,
  renderChartPng,
} from "../src/chart-report.js";
import { defaultConfig } from "../src/store.js";
import { buildDailyReportDocument } from "../src/daily-report-files.js";

describe("chart-report", () => {
  it("buildDailyRankingChartConfig stacks waiting and in-call minutes", () => {
    const chart = buildDailyRankingChartConfig(
      [
        { name: "太郎", onlineMinutes: 90, waitingMinutes: 60, inCallMinutes: 30 },
        { name: "花子", onlineMinutes: 40, waitingMinutes: 40, inCallMinutes: 0 },
      ],
      { title: "テスト", subtitle: "subtitle" }
    );

    assert.equal(chart.type, "bar");
    assert.equal(chart.data.labels.length, 2);
    assert.equal(chart.data.datasets[0].data[0], 60);
    assert.equal(chart.data.datasets[1].data[0], 30);
    assert.equal(chart.options.indexAxis, "y");
  });

  it("buildChartRequestFromReport returns null when no online minutes", () => {
    const report = {
      sessionKey: "2026-09-03",
      storeName: "大阪店",
      period: { label: "9/3 13:00 〜 9/4 01:00" },
      boys: [{ name: "太郎", onlineMinutes: 0, waitingMinutes: 0, inCallMinutes: 0 }],
    };
    assert.equal(buildChartRequestFromReport(report), null);
  });

  it("buildChartRequestFromReport limits bars and sets filename", () => {
    const boys = Array.from({ length: 20 }, (_, i) => ({
      name: `boy${i}`,
      onlineMinutes: 100 - i,
      waitingMinutes: 50,
      inCallMinutes: 50 - i,
    }));
    const request = buildChartRequestFromReport({
      sessionKey: "2026-09-03",
      storeName: "大阪店",
      period: { label: "period" },
      boys,
    });
    assert.ok(request);
    assert.equal(request.filename, "ranking-2026-09-03.png");
    assert.equal(request.chart.data.labels.length, 15);
  });

  it("buildDailyChartDmCaption includes session and counts", () => {
    const config = defaultConfig();
    const report = buildDailyReportDocument(config, {
      sessionKey: "2026-09-03",
      boys: {
        "1": { name: "太郎", onlineMinutes: 60, waitingMinutes: 40, inCallMinutes: 20 },
      },
    });
    const caption = buildDailyChartDmCaption(report);
    assert.match(caption, /2026-09-03/);
    assert.match(caption, /1/);
    assert.match(caption, /グラフ/);
  });

  it("renderChartPng posts to QuickChart and returns buffer", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
    }));

    try {
      const buffer = await renderChartPng({
        chart: { type: "bar", data: { labels: ["a"], datasets: [] } },
        width: 800,
        height: 400,
      });
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.length, 4);
      assert.equal(globalThis.fetch.mock.callCount(), 1);
      const [url, opts] = globalThis.fetch.mock.calls[0].arguments;
      assert.match(String(url), /quickchart\.io/);
      assert.equal(opts.method, "POST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
