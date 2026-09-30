// ABOUTME: JSON file storage adapter for chat messages
// ABOUTME: Simple file-based storage alternative to SQLite

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { StorageAdapter, ChatMessage } from "./base.ts";

export class JSONAdapter implements StorageAdapter {
  private filePath: string;
  private messages: ChatMessage[] = [];

  constructor(filePath?: string) {
    const dataDir = process.env.DATA_DIR || "data";
    this.filePath = filePath || `${dataDir}/messages.json`;

    // ensure directory exists
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // load existing messages
    this.loadMessages();
  }

  saveMessage(message: ChatMessage): void {
    // Replace if exists, otherwise add
    const existingIndex = this.messages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      this.messages[existingIndex] = message;
    } else {
      this.messages.push(message);
    }

    // keep only last 20, plus messages waiting for the cleanup job to expire them
    const keep = new Set(this.messages.slice(-20));
    this.messages = this.messages.filter((m) => keep.has(m) || m.expiresAt);

    this.writeMessages();
  }

  getRecentMessages(limit: number = 20): ChatMessage[] {
    const now = Date.now();
    return this.messages
      .filter((m) => !m.expiresAt || m.expiresAt > now)
      .slice(-limit);
  }

  deleteMessage(id: string): void {
    this.messages = this.messages.filter((m) => m.id !== id);
    this.writeMessages();
  }

  getExpiredMessages(): ChatMessage[] {
    const now = Date.now();
    return this.messages.filter((m) => m.expiresAt && m.expiresAt <= now);
  }

  private loadMessages(): void {
    if (!existsSync(this.filePath)) {
      this.messages = [];
      this.writeMessages();
      return;
    }

    try {
      const data = readFileSync(this.filePath, "utf-8");
      this.messages = JSON.parse(data);
    } catch (error) {
      console.error(
        "failed to load messages from json, starting fresh:",
        error,
      );
      this.messages = [];
    }
  }

  private writeMessages(): void {
    try {
      writeFileSync(
        this.filePath,
        JSON.stringify(this.messages, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("failed to write messages to json:", error);
    }
  }
}
