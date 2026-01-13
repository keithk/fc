// ABOUTME: WebSocket handler for real-time chat
// ABOUTME: Handles video messages and broadcasts them to all connected clients

import { Elysia } from "elysia";
import { messageService, type ChatMessage } from "../db/messages";

// Store reference to the Elysia server for external broadcasts
let serverInstance: any = null;

export function setServerInstance(server: any) {
  serverInstance = server;
}

// Broadcast a message to all connected WebSocket clients
export function broadcastMessage(message: ChatMessage) {
  if (!serverInstance?.server) {
    console.log("[ws] No server instance available for broadcast");
    return;
  }

  const payload = JSON.stringify({
    type: "new_message",
    message,
  });

  serverInstance.server.publish("chat", payload);
}

// Broadcast a deletion to all connected WebSocket clients
export function broadcastDeletion(messageId: string) {
  if (!serverInstance?.server) {
    return;
  }

  const payload = JSON.stringify({
    type: "delete_message",
    messageId,
  });

  serverInstance.server.publish("chat", payload);
}

export const websocketHandler = new Elysia().ws("/ws", {
  // allow large payloads for video data (up to 16mb)
  maxPayloadLength: 16 * 1024 * 1024,

  open(ws) {
    // subscribe to the chat channel for broadcasts
    ws.subscribe("chat");

    // send existing messages to new connections
    const recentMessages = messageService.getRecentMessages(20);
    ws.send(
      JSON.stringify({
        type: "connected",
        messages: recentMessages,
      }),
    );
  },

  message(ws, message) {
    // elysia sometimes sends messages as objects, sometimes as strings
    // we need to handle both cases
    let data: any;

    if (typeof message === "object" && message.type === "chat") {
      // already parsed - use directly
      data = message;
    } else {
      // convert to string and parse
      try {
        const messageString =
          typeof message === "string"
            ? message
            : Buffer.isBuffer(message)
              ? message.toString("utf-8")
              : JSON.stringify(message);

        data = JSON.parse(messageString);
      } catch {
        return;
      }
    }

    // only process chat messages
    if (data.type !== "chat") return;

    // create the chat message
    const chatMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: data.text,
      gif: data.gif,
      userId: data.userId || "anonymous",
      userHandle: data.userHandle,
      timestamp: Date.now(),
    };

    // save to database (auto-prunes to keep only last 20)
    messageService.saveMessage(chatMessage);

    // broadcast to all connected clients
    const responseMessage = JSON.stringify({
      type: "new_message",
      message: chatMessage,
    });

    ws.subscribe("chat");
    ws.send(responseMessage); // send to sender
    ws.publish("chat", responseMessage); // broadcast to others
  },

  close() {
    // cleanup happens automatically
  },
});
