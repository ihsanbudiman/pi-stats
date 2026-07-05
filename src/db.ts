import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { UsageEventInput } from "./types.js";

export type StatsDb = Database.Database;

export function getDefaultDbPath(): string {
  if (process.env.PI_STATS_DB_PATH && process.env.PI_STATS_DB_PATH.trim().length > 0) {
    return resolve(process.env.PI_STATS_DB_PATH);
  }
  return join(homedir(), ".pi", "agent", "pi-stats", "usage.sqlite");
}

export function openStatsDb(dbPath = getDefaultDbPath()): StatsDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

export function closeStatsDb(db: StatsDb): void {
  db.close();
}

function initSchema(db: StatsDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_input_cost REAL,
      estimated_output_cost REAL,
      estimated_cache_read_cost REAL,
      estimated_cache_write_cost REAL,
      estimated_total_cost REAL,
      cost_known INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_dedupe_key
      ON usage_events(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_usage_events_date
      ON usage_events(usage_date);
    CREATE INDEX IF NOT EXISTS idx_usage_events_provider
      ON usage_events(provider);
    CREATE INDEX IF NOT EXISTS idx_usage_events_model
      ON usage_events(model);
    CREATE INDEX IF NOT EXISTS idx_usage_events_date_provider_model
      ON usage_events(usage_date, provider, model);
  `);
}

export function insertUsageEvent(db: StatsDb, event: UsageEventInput): boolean {
  const result = db
    .prepare(`
      INSERT OR IGNORE INTO usage_events (
        dedupe_key,
        created_at,
        usage_date,
        provider,
        model,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        total_tokens,
        estimated_input_cost,
        estimated_output_cost,
        estimated_cache_read_cost,
        estimated_cache_write_cost,
        estimated_total_cost,
        cost_known
      ) VALUES (
        @dedupeKey,
        @createdAt,
        @usageDate,
        @provider,
        @model,
        @inputTokens,
        @outputTokens,
        @cacheReadTokens,
        @cacheWriteTokens,
        @totalTokens,
        @estimatedInputCost,
        @estimatedOutputCost,
        @estimatedCacheReadCost,
        @estimatedCacheWriteCost,
        @estimatedTotalCost,
        @costKnownValue
      )
    `)
    .run({ ...event, costKnownValue: event.costKnown ? 1 : 0 });

  return result.changes === 1;
}
