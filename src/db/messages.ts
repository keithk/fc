/**
 * message persistence service
 * uses a storage adapter pattern so you can swap out the backend
 *
 * available adapters:
 * - SQLiteAdapter (default) - uses node:sqlite
 * - JSONAdapter - simple json file, no database needed
 *
 * to change adapter, set STORAGE_ADAPTER env var:
 *   STORAGE_ADAPTER=json npm run dev
 */

import type { StorageAdapter, ChatMessage } from "./adapters/base.ts";
import { SQLiteAdapter } from "./adapters/sqlite.ts";
import { JSONAdapter } from "./adapters/json.ts";

// choose storage adapter based on env var
function createAdapter(): StorageAdapter {
  const adapterType = process.env.STORAGE_ADAPTER || "sqlite";

  switch (adapterType.toLowerCase()) {
    case "json":
      return new JSONAdapter();
    case "sqlite":
    default:
      return new SQLiteAdapter();
  }
}

class MessageService {
  private adapter: StorageAdapter;

  constructor(adapter?: StorageAdapter) {
    this.adapter = adapter || createAdapter();
  }

  saveMessage(message: ChatMessage): void {
    this.adapter.saveMessage(message);
  }

  getRecentMessages(limit: number = 20): ChatMessage[] {
    return this.adapter.getRecentMessages(limit);
  }

  deleteMessage(id: string): void {
    this.adapter.deleteMessage(id);
  }

  getExpiredMessages(): ChatMessage[] {
    return this.adapter.getExpiredMessages();
  }

  close(): void {
    this.adapter.close?.();
  }
}

export const messageService = new MessageService();
export type { ChatMessage };
