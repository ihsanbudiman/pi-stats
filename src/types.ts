export interface UsageEventInput {
  dedupeKey: string;
  createdAt: string;
  usageDate: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedInputCost: number | null;
  estimatedOutputCost: number | null;
  estimatedCacheReadCost: number | null;
  estimatedCacheWriteCost: number | null;
  estimatedTotalCost: number | null;
  costKnown: boolean;
}

export interface UsageEventRow extends UsageEventInput {
  id: number;
}

export interface UsageFilters {
  fromDate: string;
  toDate: string;
  provider?: string;
  model?: string;
}

export interface SummaryTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedTotalCost: number | null;
  knownCostEvents: number;
  unknownCostEvents: number;
  eventCount: number;
}

export interface DailyTotal {
  usageDate: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedTotalCost: number | null;
  knownCostEvents: number;
  unknownCostEvents: number;
}

export interface BreakdownRow {
  name: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedTotalCost: number | null;
  knownCostEvents: number;
  unknownCostEvents: number;
  eventCount: number;
}

export interface UsageCell {
  usageDate: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  knownCost: number;
  knownCostEvents: number;
  unknownCostEvents: number;
  eventCount: number;
}

export interface DashboardPayload {
  generatedAt: string;
  cells: UsageCell[];
}

export interface ReportData {
  generatedAt: string;
  filters: UsageFilters;
  summary: SummaryTotals;
  daily: DailyTotal[];
  providers: BreakdownRow[];
  models: BreakdownRow[];
  providerOptions: string[];
  modelOptions: string[];
}
