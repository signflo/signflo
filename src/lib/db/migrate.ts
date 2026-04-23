import "server-only";
import { getDb } from "./index";
import { sql } from "drizzle-orm";

export function runMigrations() {
  const db = getDb();

  db.run(sql`
    CREATE TABLE IF NOT EXISTS agreements (
      id TEXT PRIMARY KEY,
      short_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_path TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      style_fingerprint_json TEXT,
      low_confidence_fields_json TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      agreement_id TEXT NOT NULL REFERENCES agreements(id),
      data_json TEXT NOT NULL,
      status TEXT NOT NULL,
      pdf_path TEXT,
      pdf_sha256 TEXT,
      created_at INTEGER NOT NULL,
      submitted_at INTEGER,
      signed_at INTEGER
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      field_id TEXT NOT NULL,
      image_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}
