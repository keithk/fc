// ABOUTME: SQLite storage adapter for chat messages
// ABOUTME: Acts as a cache for messages from Jetstream, auto-prunes to 20 messages

import { Database } from "bun:sqlite";
import type { StorageAdapter, ChatMessage } from "./base";

interface DbMessage {
  id: string;
  user_id: string;
  user_handle: string | null;
  text: string;
  gif_data: string | null;
  created_at: number;
  bluesky_post_uri: string | null;
  expires_at: number | null;
}

export class SQLiteAdapter implements StorageAdapter {
  private db: Database;

  constructor(dbPath?: string) {
    const dataDir = process.env.DATA_DIR || "data";
    this.db = new Database(dbPath || `${dataDir}/chat.db`);
    this.ensureSchema();
  }

  private ensureSchema(): void {
    // Create table if it doesn't exist
    this.db.run(`
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

    // Add new columns if they don't exist (migration-safe for older DBs)
    try {
      this.db.run(`ALTER TABLE messages ADD COLUMN bluesky_post_uri TEXT`);
    } catch {
      // Column already exists
    }
    try {
      this.db.run(`ALTER TABLE messages ADD COLUMN expires_at INTEGER`);
    } catch {
      // Column already exists
    }
  }

  saveMessage(message: ChatMessage): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (id, user_id, user_handle, text, gif_data, created_at, bluesky_post_uri, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.userId,
      message.userHandle || null,
      message.text,
      message.gif || null,
      message.timestamp,
      message.blueskyPostUri || null,
      message.expiresAt || null,
    );

    this.pruneOldMessages();
  }

  getRecentMessages(limit: number = 20): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, user_handle, text, gif_data, created_at, bluesky_post_uri, expires_at
      FROM messages
      WHERE expires_at IS NULL OR expires_at > ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const now = Date.now();
    const rows = stmt.all(now, limit) as DbMessage[];

    return rows.reverse().map(this.mapDbMessage);
  }

  getAllMessages(): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, user_handle, text, gif_data, created_at, bluesky_post_uri, expires_at
      FROM messages
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as DbMessage[];
    return rows.map(this.mapDbMessage);
  }

  getMessageCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM messages")
      .get() as { count: number };
    return result.count;
  }

  deleteMessage(id: string): void {
    this.db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  }

  getExpiredMessages(): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, user_handle, text, gif_data, created_at, bluesky_post_uri, expires_at
      FROM messages
      WHERE expires_at IS NOT NULL AND expires_at <= ?
    `);

    const now = Date.now();
    const rows = stmt.all(now) as DbMessage[];
    return rows.map(this.mapDbMessage);
  }

  clearAll(): void {
    this.db.run("DELETE FROM messages");
  }

  close(): void {
    this.db.close();
  }

  private pruneOldMessages(): void {
    this.db.run(`
      DELETE FROM messages
      WHERE id NOT IN (
        SELECT id FROM messages
        ORDER BY created_at DESC
        LIMIT 20
      )
    `);
  }

  private mapDbMessage(row: DbMessage): ChatMessage {
    return {
      id: row.id,
      userId: row.user_id,
      userHandle: row.user_handle || undefined,
      text: row.text,
      gif: row.gif_data || undefined,
      timestamp: row.created_at,
      blueskyPostUri: row.bluesky_post_uri || undefined,
      expiresAt: row.expires_at || undefined,
    };
  }
}
