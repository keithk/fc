// ABOUTME: Shared SQLite connection for the message cache, OAuth stores, and Jetstream cursor
// ABOUTME: Creates the data directory and every table on first open

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { APP_CONFIG } from "../shared/config.ts";

let db: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (db) return db;

  mkdirSync(APP_CONFIG.dataDir, { recursive: true });
  db = new DatabaseSync(`${APP_CONFIG.dataDir}/chat.db`);
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_handle TEXT,
      text TEXT NOT NULL,
      gif_data TEXT,
      created_at INTEGER NOT NULL,
      bluesky_post_uri TEXT,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

    -- short-lived OAuth authorization state, keyed by the state param
    CREATE TABLE IF NOT EXISTS oauth_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- OAuth sessions, keyed by the user's DID
    CREATE TABLE IF NOT EXISTS oauth_session (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- small key/value settings, e.g. the Jetstream cursor
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Older databases predate these columns
  for (const column of ["bluesky_post_uri TEXT", "expires_at INTEGER"]) {
    try {
      db.exec(`ALTER TABLE messages ADD COLUMN ${column}`);
    } catch {
      // column already exists
    }
  }

  // Messages used to be keyed by rkey alone; drop those so the cache only holds AT-URI keys
  db.exec("DELETE FROM messages WHERE id NOT LIKE 'at://%'");

  return db;
}

export function getSetting(key: string): string | undefined {
  const row = getDatabase()
    .prepare("SELECT value FROM kv WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDatabase()
    .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
    .run(key, value);
}
