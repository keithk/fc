/**
 * json file storage adapter
 * stores messages in a simple json file (easiest deployment, no sqlite needed)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { StorageAdapter, ChatMessage } from './base'

export class JSONAdapter implements StorageAdapter {
  private filePath: string
  private messages: ChatMessage[] = []

  constructor(filePath?: string) {
    const dataDir = process.env.DATA_DIR || 'data'
    this.filePath = filePath || `${dataDir}/messages.json`

    // ensure directory exists
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // load existing messages
    this.loadMessages()
  }

  saveMessage(message: ChatMessage): void {
    this.messages.push(message)

    // keep only last 20
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(-20)
    }

    this.writeMessages()
  }

  getRecentMessages(limit: number = 20): ChatMessage[] {
    return this.messages.slice(-limit)
  }

  getAllMessages(): ChatMessage[] {
    return [...this.messages]
  }

  getMessageCount(): number {
    return this.messages.length
  }

  private loadMessages(): void {
    if (!existsSync(this.filePath)) {
      this.messages = []
      this.writeMessages()
      return
    }

    try {
      const data = readFileSync(this.filePath, 'utf-8')
      this.messages = JSON.parse(data)
    } catch (error) {
      console.error('failed to load messages from json, starting fresh:', error)
      this.messages = []
    }
  }

  private writeMessages(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.messages, null, 2), 'utf-8')
    } catch (error) {
      console.error('failed to write messages to json:', error)
    }
  }
}
