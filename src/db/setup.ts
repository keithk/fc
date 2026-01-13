/**
 * database initialization script
 * run this with: bun run db:setup
 *
 * creates the sqlite database and tables for:
 * - messages: chat messages with video data
 * - rate_limits: simple rate limiting (not currently used)
 * - sessions: oauth session storage (not currently used)
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";

const dataDir = process.env.DATA_DIR || "data";

// ensure data directory exists
try {
  mkdirSync(dataDir, { recursive: true });
} catch {
  // already exists
}

const db = new Database(`${dataDir}/chat.db`);

// messages table stores the last 20 chat messages (cache from Jetstream)
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_handle TEXT,
    text TEXT NOT NULL,
    gif_data TEXT,
    created_at INTEGER NOT NULL,
    bluesky_post_uri TEXT,
    expires_at INTEGER
  )
`);

// rate_limits table (reserved for future use)
db.run(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    user_id TEXT PRIMARY KEY,
    last_message_at INTEGER NOT NULL
  )
`);

// sessions table (reserved for future use)
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// indexes for faster queries
db.run(`
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
`);

console.log("✅ database initialized");

db.close();
