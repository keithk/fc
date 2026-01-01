/**
 * sqlite storage adapter
 * stores messages in sqlite database (default option)
 */

import { Database } from 'bun:sqlite'
import type { StorageAdapter, ChatMessage } from './base'

interface DbMessage {
  id: string
  user_id: string
  user_handle: string | null
  text: string
  gif_data: string | null
  created_at: number
}

export class SQLiteAdapter implements StorageAdapter {
  private db: Database

  constructor(dbPath?: string) {
    const dataDir = process.env.DATA_DIR || 'data'
    this.db = new Database(dbPath || `${dataDir}/chat.db`)
  }

  saveMessage(message: ChatMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, user_id, user_handle, text, gif_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      message.id,
      message.userId,
      message.userHandle || null,
      message.text,
      message.gif || null,
      message.timestamp
    )

    this.pruneOldMessages()
  }

  getRecentMessages(limit: number = 20): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, user_handle, text, gif_data, created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT ?
    `)

    const rows = stmt.all(limit) as DbMessage[]

    return rows.reverse().map(this.mapDbMessage)
  }

  getAllMessages(): ChatMessage[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, user_handle, text, gif_data, created_at
      FROM messages
      ORDER BY created_at DESC
    `)

    const rows = stmt.all() as DbMessage[]
    return rows.map(this.mapDbMessage)
  }

  getMessageCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
    return result.count
  }

  close(): void {
    this.db.close()
  }

  private pruneOldMessages(): void {
    this.db.run(`
      DELETE FROM messages
      WHERE id NOT IN (
        SELECT id FROM messages
        ORDER BY created_at DESC
        LIMIT 20
      )
    `)
  }

  private mapDbMessage(row: DbMessage): ChatMessage {
    return {
      id: row.id,
      userId: row.user_id,
      userHandle: row.user_handle || undefined,
      text: row.text,
      gif: row.gif_data || undefined,
      timestamp: row.created_at
    }
  }
}
