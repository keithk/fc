/**
 * storage adapter interface
 * implement this to support different storage backends (sqlite, json, redis, etc.)
 */

export interface ChatMessage {
  // AT-URI of the is.keith.fc.message record
  id: string;
  text: string;
  videoUrl?: string;
  userId: string;
  userHandle?: string;
  timestamp: number;
  blueskyPostUri?: string;
  expiresAt?: number;
}

export interface StorageAdapter {
  // save a message and auto-prune to keep only last 20
  saveMessage(message: ChatMessage): void;

  // get recent messages (oldest first for display)
  getRecentMessages(limit?: number): ChatMessage[];

  // delete a message by id
  deleteMessage(id: string): void;

  // get expired messages
  getExpiredMessages(): ChatMessage[];

  // cleanup (close connections, etc.)
  close?(): void;
}
