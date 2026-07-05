import type { StatsDb } from "./db.js";
import { formatLocalDate } from "./collector.js";
import type { BreakdownRow, DailyTotal, DashboardPayload, ReportData, SummaryTotals, UsageCell, UsageFilters } from "./types.js";

interface SqlParts {
  where: string;
  params: Record<string, string>;
}

function buildWhere(filters: UsageFilters): SqlParts {
  const clauses = ["usage_date BETWEEN @fromDate AND @toDate"];
  const params: Record<string, string> = {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };

  if (filters.provider) {
    clauses.push("provider = @provider");
    params.provider = filters.provider;
  }
  if (filters.model) {
    clauses.push("model = @model");
    params.model = filters.model;
  }

  return { where: clauses.join(" AND "), params };
}

function nullableSum(value: unknown, knownEvents: number): number | null {
  if (knownEvents === 0) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeSummary(row: any): SummaryTotals {
  const knownCostEvents = Number(row.known_cost_events ?? 0);
  return {
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    cacheReadTokens: Number(row.cache_read_tokens ?? 0),
    cacheWriteTokens: Number(row.cache_write_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    estimatedTotalCost: nullableSum(row.estimated_total_cost, knownCostEvents),
    knownCostEvents,
    unknownCostEvents: Number(row.unknown_cost_events ?? 0),
    eventCount: Number(row.event_count ?? 0),
  };
}

function normalizeBreakdown(row: any): BreakdownRow {
  const knownCostEvents = Number(row.known_cost_events ?? 0);
  return {
    name: String(row.name),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    cacheReadTokens: Number(row.cache_read_tokens ?? 0),
    cacheWriteTokens: Number(row.cache_write_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    estimatedTotalCost: nullableSum(row.estimated_total_cost, knownCostEvents),
    knownCostEvents,
    unknownCostEvents: Number(row.unknown_cost_events ?? 0),
    eventCount: Number(row.event_count ?? 0),
  };
}

export function getDefaultWeeklyFilters(now = new Date()): UsageFilters {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  from.setDate(to.getDate() - 6);
  return { fromDate: formatLocalDate(from), toDate: formatLocalDate(to) };
}

export function getDashboardPayload(db: StatsDb, now = new Date()): DashboardPayload {
  const cells = db
    .prepare(`
      SELECT usage_date, provider, model,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(CASE WHEN cost_known = 1 THEN estimated_total_cost ELSE 0 END) AS known_cost,
        SUM(CASE WHEN cost_known = 1 THEN 1 ELSE 0 END) AS known_cost_events,
        SUM(CASE WHEN cost_known = 0 THEN 1 ELSE 0 END) AS unknown_cost_events,
        COUNT(*) AS event_count
      FROM usage_events
      GROUP BY usage_date, provider, model
      ORDER BY usage_date ASC
    `)
    .all()
    .map((row: any): UsageCell => ({
      usageDate: String(row.usage_date),
      provider: String(row.provider),
      model: String(row.model),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      cacheReadTokens: Number(row.cache_read_tokens ?? 0),
      cacheWriteTokens: Number(row.cache_write_tokens ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      knownCost: Number(row.known_cost ?? 0),
      knownCostEvents: Number(row.known_cost_events ?? 0),
      unknownCostEvents: Number(row.unknown_cost_events ?? 0),
      eventCount: Number(row.event_count ?? 0),
    }));

  return { generatedAt: now.toISOString(), cells };
}

export function getReportData(db: StatsDb, filters: UsageFilters, now = new Date()): ReportData {
  const { where, params } = buildWhere(filters);
  const aggregateColumns = `
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(cache_read_tokens) AS cache_read_tokens,
    SUM(cache_write_tokens) AS cache_write_tokens,
    SUM(total_tokens) AS total_tokens,
    SUM(CASE WHEN cost_known = 1 THEN estimated_total_cost ELSE 0 END) AS estimated_total_cost,
    SUM(CASE WHEN cost_known = 1 THEN 1 ELSE 0 END) AS known_cost_events,
    SUM(CASE WHEN cost_known = 0 THEN 1 ELSE 0 END) AS unknown_cost_events,
    COUNT(*) AS event_count
  `;

  const summary = normalizeSummary(db.prepare(`SELECT ${aggregateColumns} FROM usage_events WHERE ${where}`).get(params));

  const daily = db
    .prepare(`
      SELECT usage_date, ${aggregateColumns}
      FROM usage_events
      WHERE ${where}
      GROUP BY usage_date
      ORDER BY usage_date ASC
    `)
    .all(params)
    .map((row: any): DailyTotal => {
      const normalized = normalizeSummary(row);
      return { usageDate: String(row.usage_date), ...normalized };
    });

  const providers = db
    .prepare(`
      SELECT provider AS name, ${aggregateColumns}
      FROM usage_events
      WHERE ${where}
      GROUP BY provider
      ORDER BY total_tokens DESC, provider ASC
    `)
    .all(params)
    .map(normalizeBreakdown);

  const models = db
    .prepare(`
      SELECT model AS name, ${aggregateColumns}
      FROM usage_events
      WHERE ${where}
      GROUP BY model
      ORDER BY total_tokens DESC, model ASC
    `)
    .all(params)
    .map(normalizeBreakdown);

  const providerOptions = db
    .prepare("SELECT DISTINCT provider FROM usage_events ORDER BY provider ASC")
    .all()
    .map((row: any) => String(row.provider));

  const modelOptions = db
    .prepare("SELECT DISTINCT model FROM usage_events ORDER BY model ASC")
    .all()
    .map((row: any) => String(row.model));

  return {
    generatedAt: now.toISOString(),
    filters,
    summary,
    daily,
    providers,
    models,
    providerOptions,
    modelOptions,
  };
}
