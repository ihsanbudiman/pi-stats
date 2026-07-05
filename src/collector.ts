import { createHash } from "node:crypto";
import type { UsageEventInput } from "./types.js";

interface UsageCostLike {
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  total?: unknown;
}

interface UsageLike {
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  totalTokens?: unknown;
  cost?: UsageCostLike;
}

interface AssistantMessageLike {
  role?: unknown;
  timestamp?: unknown;
  provider?: unknown;
  model?: unknown;
  usage?: UsageLike;
}

export interface ExtractUsageOptions {
  costKnown?: boolean;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDedupeKey(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableCost(value: unknown, costKnown: boolean): number | null {
  if (!costKnown) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function extractUsageEvent(message: unknown, options: ExtractUsageOptions = {}): UsageEventInput | null {
  const candidate = message as AssistantMessageLike;
  if (candidate.role !== "assistant") return null;
  if (!candidate.usage) return null;
  if (typeof candidate.provider !== "string" || candidate.provider.length === 0) return null;
  if (typeof candidate.model !== "string" || candidate.model.length === 0) return null;

  const timestamp = typeof candidate.timestamp === "number" && Number.isFinite(candidate.timestamp)
    ? candidate.timestamp
    : Date.now();
  const createdAt = new Date(timestamp).toISOString();
  const usageDate = formatLocalDate(new Date(timestamp));
  const usage = candidate.usage;
  const cost = usage.cost ?? {};
  const inputTokens = numberOrZero(usage.input);
  const outputTokens = numberOrZero(usage.output);
  const cacheReadTokens = numberOrZero(usage.cacheRead);
  const cacheWriteTokens = numberOrZero(usage.cacheWrite);
  const fallbackTotal = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const totalTokens = numberOrZero(usage.totalTokens) || fallbackTotal;
  const costKnown = options.costKnown ?? numberOrZero(cost.total) > 0;

  const dedupeKey = createDedupeKey([
    createdAt,
    candidate.provider,
    candidate.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
  ]);

  return {
    dedupeKey,
    createdAt,
    usageDate,
    provider: candidate.provider,
    model: candidate.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    estimatedInputCost: nullableCost(cost.input, costKnown),
    estimatedOutputCost: nullableCost(cost.output, costKnown),
    estimatedCacheReadCost: nullableCost(cost.cacheRead, costKnown),
    estimatedCacheWriteCost: nullableCost(cost.cacheWrite, costKnown),
    estimatedTotalCost: nullableCost(cost.total, costKnown),
    costKnown,
  };
}
