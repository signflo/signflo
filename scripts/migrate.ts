/**
 * Standalone migration runner. Runs with `npx tsx scripts/migrate.ts`.
 * Kept separate from src/lib/db so it doesn't pull in the `server-only` guard.
 *
 * Idempotent — creates tables if missing and backfills columns added in
 * later migrations via ALTER TABLE guarded by a pragma check.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const dbPath = resolve(process.cwd(), process.env.DATABASE_URL ?? "./data/signflo.db");
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// --- Base tables (created on first run) --------------------------------------

const createStatements = [
  `CREATE TABLE IF NOT EXISTS agreements (
    id TEXT PRIMARY KEY,
    short_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_path TEXT NOT NULL,
    schema_json TEXT NOT NULL,
    style_fingerprint_json TEXT,
    low_confidence_fields_json TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id),
    data_json TEXT NOT NULL,
    status TEXT NOT NULL,
    pdf_path TEXT,
    pdf_sha256 TEXT,
    created_at INTEGER NOT NULL,
    submitted_at INTEGER,
    signed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS signatures (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(id),
    field_id TEXT NOT NULL,
    image_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS submission_tokens (
    token TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(id),
    role TEXT NOT NULL DEFAULT 'owner',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_submission_tokens_submission ON submission_tokens(submission_id)`,
];

for (const sql of createStatements) {
  sqlite.prepare(sql).run();
}

// --- Additive column migrations ----------------------------------------------
// Each entry is idempotent: check existing columns, add if missing.

function columnExists(table: string, column: string): boolean {
  const rows = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

const additiveColumns: Array<{ table: string; column: string; ddl: string }> = [
  // Phase C.2 — workflow state
  {
    table: "agreements",
    column: "workflow_steps_json",
    ddl: `ALTER TABLE agreements ADD COLUMN workflow_steps_json TEXT`,
  },
  {
    table: "submissions",
    column: "current_step_index",
    ddl: `ALTER TABLE submissions ADD COLUMN current_step_index INTEGER NOT NULL DEFAULT 0`,
  },
  {
    table: "submissions",
    column: "history_json",
    ddl: `ALTER TABLE submissions ADD COLUMN history_json TEXT`,
  },
  // Phase C cleanup PR #9 — multi-page ingestion
  {
    table: "agreements",
    column: "source_paths_json",
    ddl: `ALTER TABLE agreements ADD COLUMN source_paths_json TEXT`,
  },
];

for (const m of additiveColumns) {
  if (!columnExists(m.table, m.column)) {
    sqlite.prepare(m.ddl).run();
    console.log(`added ${m.table}.${m.column}`);
  }
}

console.log(`migrated: ${dbPath}`);
sqlite.close();
