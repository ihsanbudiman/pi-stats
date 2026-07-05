import { describe, expect, it } from "vitest";
import { createDedupeKey, extractUsageEvent, formatLocalDate } from "../src/collector.js";

const assistantMessage = {
  role: "assistant",
  timestamp: Date.UTC(2026, 6, 5, 10, 30, 0),
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  usage: {
    input: 100,
    output: 40,
    cacheRead: 20,
    cacheWrite: 10,
    totalTokens: 170,
    cost: {
      input: 0.0003,
      output: 0.0006,
      cacheRead: 0.00002,
      cacheWrite: 0.00004,
      total: 0.00096,
    },
  },
};

describe("formatLocalDate", () => {
  it("formats a Date as local YYYY-MM-DD", () => {
    expect(formatLocalDate(new Date(2026, 6, 5, 3, 4, 5))).toBe("2026-07-05");
  });
});

describe("createDedupeKey", () => {
  it("returns a stable sha256 hex key", () => {
    const first = createDedupeKey(["2026-07-05", "anthropic", "sonnet", "100"]);
    const second = createDedupeKey(["2026-07-05", "anthropic", "sonnet", "100"]);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("extractUsageEvent", () => {
  it("extracts assistant usage with known cost", () => {
    const event = extractUsageEvent(assistantMessage, { costKnown: true });

    expect(event).toMatchObject({
      usageDate: "2026-07-05",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      totalTokens: 170,
      estimatedTotalCost: 0.00096,
      costKnown: true,
    });
    expect(event?.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stores unknown cost as null values", () => {
    const event = extractUsageEvent(assistantMessage, { costKnown: false });

    expect(event?.estimatedInputCost).toBeNull();
    expect(event?.estimatedOutputCost).toBeNull();
    expect(event?.estimatedCacheReadCost).toBeNull();
    expect(event?.estimatedCacheWriteCost).toBeNull();
    expect(event?.estimatedTotalCost).toBeNull();
    expect(event?.costKnown).toBe(false);
  });

  it("ignores non-assistant messages", () => {
    expect(extractUsageEvent({ role: "user", content: "hello" })).toBeNull();
  });

  it("ignores assistant messages without usage", () => {
    expect(extractUsageEvent({ role: "assistant", provider: "x", model: "y" })).toBeNull();
  });
});
