/**
 * Standalone migration runner. Runs with `npx tsx scripts/migrate.ts`.
 * Kept separate from src/lib/db so it doesn't pull in the `server-only` guard.
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

const statements = [
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
];

for (const sql of statements) {
  sqlite.prepare(sql).run();
}

console.log(`migrated: ${dbPath}`);
sqlite.close();
