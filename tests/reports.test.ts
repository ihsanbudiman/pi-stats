import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeStatsDb, insertUsageEvent, openStatsDb } from "../src/db.js";
import { getDefaultWeeklyFilters, getReportData } from "../src/reports.js";
import type { UsageEventInput } from "../src/types.js";

let tempDir: string | undefined;

function makeTempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), "pi-stats-report-test-"));
  return join(tempDir, "usage.sqlite");
}

function makeEvent(day: string, provider: string, model: string, tokens: number, cost: number | null): UsageEventInput {
  return {
    dedupeKey: `${day}-${provider}-${model}-${tokens}`,
    createdAt: `${day}T10:00:00.000Z`,
    usageDate: day,
    provider,
    model,
    inputTokens: tokens,
    outputTokens: tokens / 2,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    totalTokens: tokens + tokens / 2 + 15,
    estimatedInputCost: cost === null ? null : cost / 2,
    estimatedOutputCost: cost === null ? null : cost / 2,
    estimatedCacheReadCost: cost === null ? null : 0,
    estimatedCacheWriteCost: cost === null ? null : 0,
    estimatedTotalCost: cost,
    costKnown: cost !== null,
  };
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("getDefaultWeeklyFilters", () => {
  it("returns a 7-day inclusive local range", () => {
    const filters = getDefaultWeeklyFilters(new Date(2026, 6, 5, 12, 0, 0));
    expect(filters).toEqual({ fromDate: "2026-06-29", toDate: "2026-07-05" });
  });
});

describe("getReportData", () => {
  it("aggregates by date, provider, and model", () => {
    const db = openStatsDb(makeTempDbPath());
    insertUsageEvent(db, makeEvent("2026-07-01", "anthropic", "sonnet", 100, 0.3));
    insertUsageEvent(db, makeEvent("2026-07-02", "openai", "gpt", 50, null));
    insertUsageEvent(db, makeEvent("2026-07-02", "anthropic", "sonnet", 25, 0.1));

    const report = getReportData(db, { fromDate: "2026-07-01", toDate: "2026-07-02" }, new Date("2026-07-03T00:00:00.000Z"));

    expect(report.summary.eventCount).toBe(3);
    expect(report.summary.knownCostEvents).toBe(2);
    expect(report.summary.unknownCostEvents).toBe(1);
    expect(report.summary.estimatedTotalCost).toBeCloseTo(0.4);
    expect(report.daily).toHaveLength(2);
    expect(report.providers.map((row) => row.name)).toEqual(["anthropic", "openai"]);
    expect(report.models.map((row) => row.name)).toEqual(["sonnet", "gpt"]);
    closeStatsDb(db);
  });

  it("applies provider and model filters", () => {
    const db = openStatsDb(makeTempDbPath());
    insertUsageEvent(db, makeEvent("2026-07-01", "anthropic", "sonnet", 100, 0.3));
    insertUsageEvent(db, makeEvent("2026-07-01", "openai", "gpt", 50, 0.2));

    const report = getReportData(db, {
      fromDate: "2026-07-01",
      toDate: "2026-07-01",
      provider: "openai",
      model: "gpt",
    });

    expect(report.summary.eventCount).toBe(1);
    expect(report.providers[0]?.name).toBe("openai");
    expect(report.models[0]?.name).toBe("gpt");
    closeStatsDb(db);
  });
});
