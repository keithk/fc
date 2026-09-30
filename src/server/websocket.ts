// ABOUTME: WebSocket feed for real-time chat
// ABOUTME: Read-only for clients; the server broadcasts messages that arrive via Jetstream

import { messageService, type ChatMessage } from "../db/messages.ts";

interface Peer {
  send(data: string): unknown;
}

// Keyed by socket id: Elysia may hand open() and close() different wrapper objects
const peers = new Map<string, Peer>();

function broadcast(payload: object) {
  const data = JSON.stringify(payload);
  for (const peer of peers.values()) peer.send(data);
}

// Broadcast a new message to all connected WebSocket clients
export function broadcastMessage(message: ChatMessage) {
  broadcast({ type: "new_message", message });
}

// Broadcast a deletion to all connected WebSocket clients
export function broadcastDeletion(messageId: string) {
  broadcast({ type: "delete_message", messageId });
}

// Registered on the root app in index.ts: a plugin instance wouldn't get the Node adapter's WebSocket support
export const websocketHandler = {
  open(ws: Peer & { id: string }) {
    peers.set(ws.id, ws);
    ws.send(
      JSON.stringify({
        type: "connected",
        messages: messageService.getRecentMessages(20),
      }),
    );
  },

  close(ws: { id: string }) {
    peers.delete(ws.id);
  },
};
