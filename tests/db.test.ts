import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeStatsDb, getDefaultDbPath, insertUsageEvent, openStatsDb } from "../src/db.js";
import type { UsageEventInput } from "../src/types.js";

let tempDir: string | undefined;

function makeTempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), "pi-stats-test-"));
  return join(tempDir, "usage.sqlite");
}

function makeEvent(overrides: Partial<UsageEventInput> = {}): UsageEventInput {
  return {
    dedupeKey: "dedupe-1",
    createdAt: "2026-07-05T10:00:00.000Z",
    usageDate: "2026-07-05",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 20,
    cacheWriteTokens: 10,
    totalTokens: 180,
    estimatedInputCost: 0.1,
    estimatedOutputCost: 0.2,
    estimatedCacheReadCost: 0.01,
    estimatedCacheWriteCost: 0.02,
    estimatedTotalCost: 0.33,
    costKnown: true,
    ...overrides,
  };
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("getDefaultDbPath", () => {
  it("uses PI_STATS_DB_PATH when set", () => {
    const previous = process.env.PI_STATS_DB_PATH;
    process.env.PI_STATS_DB_PATH = "/tmp/custom-pi-stats.sqlite";
    expect(getDefaultDbPath()).toBe("/tmp/custom-pi-stats.sqlite");
    if (previous === undefined) delete process.env.PI_STATS_DB_PATH;
    else process.env.PI_STATS_DB_PATH = previous;
  });
});

describe("openStatsDb", () => {
  it("creates schema and requested indexes", () => {
    const db = openStatsDb(makeTempDbPath());
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
      .map((row: any) => row.name);

    expect(indexes).toContain("idx_usage_events_date");
    expect(indexes).toContain("idx_usage_events_provider");
    expect(indexes).toContain("idx_usage_events_model");
    expect(indexes).toContain("idx_usage_events_date_provider_model");
    expect(indexes).toContain("idx_usage_events_dedupe_key");
    closeStatsDb(db);
  });
});

describe("insertUsageEvent", () => {
  it("inserts one usage row", () => {
    const db = openStatsDb(makeTempDbPath());
    const inserted = insertUsageEvent(db, makeEvent());
    const count = db.prepare("SELECT COUNT(*) AS count FROM usage_events").get() as { count: number };

    expect(inserted).toBe(true);
    expect(count.count).toBe(1);
    closeStatsDb(db);
  });

  it("ignores duplicate dedupe keys", () => {
    const db = openStatsDb(makeTempDbPath());
    const first = insertUsageEvent(db, makeEvent());
    const second = insertUsageEvent(db, makeEvent({ inputTokens: 999 }));
    const count = db.prepare("SELECT COUNT(*) AS count FROM usage_events").get() as { count: number };

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(count.count).toBe(1);
    closeStatsDb(db);
  });
});
