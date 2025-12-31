/**
 * storage adapter interface
 * implement this to support different storage backends (sqlite, json, redis, etc.)
 */

export interface ChatMessage {
  id: string
  text: string
  gif?: string
  userId: string
  userHandle?: string
  timestamp: number
}

export interface StorageAdapter {
  // save a message and auto-prune to keep only last 20
  saveMessage(message: ChatMessage): void

  // get recent messages (oldest first for display)
  getRecentMessages(limit?: number): ChatMessage[]

  // get all messages (for export)
  getAllMessages(): ChatMessage[]

  // get count of messages
  getMessageCount(): number

  // cleanup (close connections, etc.)
  close?(): void
}
