import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { extractUsageEvent } from "../../src/collector.js";
import { closeStatsDb, getDefaultDbPath, insertUsageEvent, openStatsDb, type StatsDb } from "../../src/db.js";
import { openBrowser, startDashboardServer, writeStaticReport, type DashboardServer } from "../../src/dashboard.js";
import { getDashboardPayload, getDefaultWeeklyFilters, getReportData } from "../../src/reports.js";
import type { SummaryTotals } from "../../src/types.js";

function formatTokens(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCost(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function formatSummary(summary: SummaryTotals): string {
  return [
    `pi-stats · last 7 days`,
    `tokens: ${formatTokens(summary.totalTokens)} total (${formatTokens(summary.inputTokens)} in / ${formatTokens(summary.outputTokens)} out)`,
    `cache: ${formatTokens(summary.cacheReadTokens)} read / ${formatTokens(summary.cacheWriteTokens)} write`,
    `known estimated cost: ${formatCost(summary.estimatedTotalCost)}`,
    `events: ${summary.eventCount} tracked, ${summary.unknownCostEvents} with unknown pricing`,
  ].join("\n");
}

function hasKnownModelCost(ctx: any, provider: string, model: string): boolean | undefined {
  const found = ctx.modelRegistry?.find?.(provider, model);
  const cost = found?.cost;
  if (!cost || typeof cost !== "object") return undefined;
  return [cost.input, cost.output, cost.cacheRead, cost.cacheWrite].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

function defaultExportPath(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return resolve(`pi-stats-${year}-${month}-${day}.html`);
}

export default function (pi: ExtensionAPI) {
  let db: StatsDb | undefined;
  let dashboard: DashboardServer | undefined;

  const getDb = (): StatsDb => {
    db ??= openStatsDb();
    return db;
  };

  pi.on("message_end", async (event, ctx) => {
    const message = event.message as any;
    const costKnown = message?.provider && message?.model ? hasKnownModelCost(ctx, message.provider, message.model) : undefined;
    const usageEvent = extractUsageEvent(message, { costKnown });
    if (!usageEvent) return;
    insertUsageEvent(getDb(), usageEvent);
  });

  pi.on("session_shutdown", async () => {
    if (dashboard) {
      dashboard.server.close();
      dashboard = undefined;
    }
    if (db) {
      closeStatsDb(db);
      db = undefined;
    }
  });

  pi.registerCommand("pi-stats", {
    description: "Show Pi token usage stats, open dashboard, export HTML, or print DB path",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0] ?? "summary";

      if (subcommand === "db") {
        ctx.ui.notify(getDefaultDbPath(), "info");
        return;
      }

      if (subcommand === "open") {
        dashboard ??= await startDashboardServer({ db: getDb() });
        openBrowser(dashboard.url);
        ctx.ui.notify(`pi-stats dashboard: ${dashboard.url}`, "info");
        return;
      }

      if (subcommand === "export") {
        const outputPath = parts[1] ? resolve(parts[1]) : defaultExportPath();
        writeStaticReport(outputPath, getDashboardPayload(getDb()));
        ctx.ui.notify(`pi-stats report exported: ${outputPath}`, "info");
        return;
      }

      if (subcommand !== "summary") {
        ctx.ui.notify("Usage: /pi-stats [open|export [file]|db]", "warning");
        return;
      }

      const report = getReportData(getDb(), getDefaultWeeklyFilters());
      ctx.ui.notify(formatSummary(report.summary), "info");
    },
  });
}
