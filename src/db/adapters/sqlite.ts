// ABOUTME: SQLite storage adapter for chat messages
// ABOUTME: Acts as a cache for messages from Jetstream, auto-prunes to 20 messages

import type { DatabaseSync } from "node:sqlite";
import type { StorageAdapter, ChatMessage } from "./base.ts";
import { getDatabase } from "../database.ts";

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
  private db: DatabaseSync;

  constructor() {
    this.db = getDatabase();
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
      message.videoUrl || null,
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
    const rows = stmt.all(now, limit) as unknown as DbMessage[];

    return rows.reverse().map(this.mapDbMessage);
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
    const rows = stmt.all(now) as unknown as DbMessage[];
    return rows.map(this.mapDbMessage);
  }

  close(): void {
    this.db.close();
  }

  // Messages waiting to expire stay until the cleanup job deletes them from the PDS
  private pruneOldMessages(): void {
    this.db.exec(`
      DELETE FROM messages
      WHERE expires_at IS NULL AND id NOT IN (
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
      videoUrl: row.gif_data || undefined,
      timestamp: row.created_at,
      blueskyPostUri: row.bluesky_post_uri || undefined,
      expiresAt: row.expires_at || undefined,
    };
  }
}
