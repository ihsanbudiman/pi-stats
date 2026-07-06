import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { formatLocalDate } from "../src/collector.js";
import { closeStatsDb, insertUsageEvent, openStatsDb } from "../src/db.js";
import { buildStaticReportHtml, startDashboardServer, writeStaticReport } from "../src/dashboard.js";
import type { DashboardPayload, UsageCell, UsageEventInput } from "../src/types.js";

let tempDir: string | undefined;

function makeEvent(day: string): UsageEventInput {
  return {
    dedupeKey: `dashboard-${day}`,
    createdAt: `${day}T10:00:00.000Z`,
    usageDate: day,
    provider: "custom-provider",
    model: "gpt-5.5",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 20,
    cacheWriteTokens: 10,
    totalTokens: 180,
    estimatedInputCost: null,
    estimatedOutputCost: null,
    estimatedCacheReadCost: null,
    estimatedCacheWriteCost: null,
    estimatedTotalCost: null,
    costKnown: false,
  };
}

function makeCell(overrides: Partial<UsageCell>): UsageCell {
  return {
    usageDate: "2026-07-05",
    provider: "custom-provider",
    model: "gpt-5.5",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 20,
    cacheWriteTokens: 10,
    totalTokens: 180,
    knownCost: 0,
    knownCostEvents: 0,
    unknownCostEvents: 1,
    eventCount: 1,
    ...overrides,
  };
}

function localDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatLocalDate(date);
}

const payload: DashboardPayload = {
  generatedAt: "2026-07-05T12:00:00.000Z",
  cells: [
    makeCell({ usageDate: localDateDaysAgo(0) }),
    makeCell({ usageDate: localDateDaysAgo(20), provider: "other-provider", model: "other-model", totalTokens: 1000, inputTokens: 900 }),
  ],
};

function renderDashboard(): JSDOM {
  // any network use is a regression: filtering must work from embedded data alone
  return new JSDOM(buildStaticReportHtml(payload), {
    url: "http://127.0.0.1:7478/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      (window as any).fetch = () => {
        throw new Error("dashboard must not fetch: filtering is client-side");
      };
    },
  });
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("buildStaticReportHtml", () => {
  it("creates a self-contained offline page with the usage data embedded", () => {
    const html = buildStaticReportHtml(payload);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Pi Stats");
    expect(html).toContain("custom-provider");
    expect(html).toContain('id="range-btn"');
    expect(html).toContain('name="provider"');
    expect(html).toContain('name="model"');
    expect(html).not.toContain("https://");
    expect(html).not.toContain("cdn");
  });
});

describe("dashboard client behavior", () => {
  it("renders the default 7-day view from embedded data without any network", () => {
    const dom = renderDashboard();
    const doc = dom.window.document;

    expect(doc.querySelector("#range-btn-label")?.textContent).toBe("Last 7 days");
    // only the recent cell (180 tokens) is inside the last 7 days
    expect(doc.querySelector(".tile .value")?.textContent).toBe("180");
    expect(doc.querySelectorAll("#providers tbody tr")).toHaveLength(2);
  });

  it("keeps filter selections and updates totals in place when clicked", () => {
    const dom = renderDashboard();
    const doc = dom.window.document;

    (doc.querySelector('.preset-row[data-preset="30d"]') as HTMLButtonElement).click();
    // selection sticks and both cells (180 + 1000) are now in range
    expect(doc.querySelector("#range-btn-label")?.textContent).toBe("Last 30 days");
    expect(doc.querySelector(".tile .value")?.textContent).toBe("1.2K");
    expect(doc.querySelectorAll("#providers tbody tr")).toHaveLength(4);

    const provider = doc.querySelector('select[name="provider"]') as HTMLSelectElement;
    provider.value = "other-provider";
    provider.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    // provider filter scopes everything below; range selection is untouched
    expect(doc.querySelector("#range-btn-label")?.textContent).toBe("Last 30 days");
    expect(doc.querySelector(".tile .value")?.textContent).toBe("1K");
    expect(doc.querySelectorAll("#models tbody tr")).toHaveLength(2);
    expect(doc.querySelector("#models .name")?.textContent).toBe("other-model");
  });

  it("applies a custom range from two calendar clicks", () => {
    const dom = renderDashboard();
    const doc = dom.window.document;

    (doc.querySelector("#range-btn") as HTMLButtonElement).click();
    expect((doc.querySelector("#range-pop") as HTMLElement).hidden).toBe(false);

    // navigate back until the start date (25 days ago) is visible
    const startIso = localDateDaysAgo(25);
    for (let i = 0; i < 3 && !doc.querySelector(`.cal-day[data-date="${startIso}"]`); i++) {
      (doc.querySelector('.cal-nav[aria-label="Previous month"]') as HTMLButtonElement).click();
    }
    (doc.querySelector(`.cal-day[data-date="${startIso}"]`) as HTMLButtonElement).click();

    const endIso = localDateDaysAgo(0);
    for (let i = 0; i < 3 && !doc.querySelector(`.cal-day[data-date="${endIso}"]`); i++) {
      (doc.querySelector('.cal-nav[aria-label="Next month"]') as HTMLButtonElement).click();
    }
    (doc.querySelector(`.cal-day[data-date="${endIso}"]`) as HTMLButtonElement).click();

    // both cells (180 + 1000) fall inside the picked range; popover closed
    expect((doc.querySelector("#range-pop") as HTMLElement).hidden).toBe(true);
    expect(doc.querySelector(".tile .value")?.textContent).toBe("1.2K");
    expect(doc.querySelector("#range-btn-label")?.textContent).toContain("–");
  });
});

describe("writeStaticReport", () => {
  it("writes the report file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-stats-dashboard-test-"));
    const file = join(tempDir, "report.html");

    writeStaticReport(file, payload);

    expect(readFileSync(file, "utf8")).toContain("Pi Stats");
  });
});

describe("startDashboardServer", () => {
  it("lets range presets override stale date fields in the report api", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "pi-stats-dashboard-test-"));
    const today = formatLocalDate(new Date());
    const db = openStatsDb(join(tempDir, "usage.sqlite"));
    insertUsageEvent(db, makeEvent(today));
    const dashboard = await startDashboardServer({ db });

    try {
      const response = await fetch(`${dashboard.url}api/report?range=today&from=2000-01-01&to=2000-01-01`);
      const data = (await response.json()) as { filters: unknown; summary: { eventCount: number } };

      expect(data.filters).toMatchObject({ fromDate: today, toDate: today });
      expect(data.summary.eventCount).toBe(1);
    } finally {
      dashboard.server.close();
      closeStatsDb(db);
    }
  });
});
