/**
 * websocket handler for real-time chat
 * handles video messages and broadcasts them to all connected clients
 */

import { Elysia } from 'elysia'
import { messageService } from '../db/messages'

interface ChatMessage {
  id: string
  text: string
  gif?: string
  userId: string
  userHandle?: string
  timestamp: number
}

export const websocketHandler = new Elysia()
  .ws('/ws', {
    // allow large payloads for video data (up to 16mb)
    maxPayloadLength: 16 * 1024 * 1024,

    open(ws) {
      // subscribe to the chat channel for broadcasts
      ws.subscribe('chat')

      // send existing messages to new connections
      const recentMessages = messageService.getRecentMessages(20)
      ws.send(JSON.stringify({
        type: 'connected',
        messages: recentMessages
      }))
    },

    message(ws, message) {
      // elysia sometimes sends messages as objects, sometimes as strings
      // we need to handle both cases
      let data: any

      if (typeof message === 'object' && message.type === 'chat') {
        // already parsed - use directly
        data = message
      } else {
        // convert to string and parse
        try {
          const messageString = typeof message === 'string'
            ? message
            : Buffer.isBuffer(message)
              ? message.toString('utf-8')
              : JSON.stringify(message)

          data = JSON.parse(messageString)
        } catch {
          return
        }
      }

      // only process chat messages
      if (data.type !== 'chat') return

      // create the chat message
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: data.text,
        gif: data.gif,
        userId: data.userId || 'anonymous',
        userHandle: data.userHandle,
        timestamp: Date.now()
      }

      // save to database (auto-prunes to keep only last 20)
      messageService.saveMessage(chatMessage)

      // broadcast to all connected clients
      const responseMessage = JSON.stringify({
        type: 'new_message',
        message: chatMessage
      })

      ws.subscribe('chat')
      ws.send(responseMessage) // send to sender
      ws.publish('chat', responseMessage) // broadcast to others
    },

    close() {
      // cleanup happens automatically
    }
  })