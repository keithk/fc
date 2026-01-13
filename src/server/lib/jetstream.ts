// ABOUTME: Jetstream WebSocket client for real-time ATProto events
// ABOUTME: Subscribes to is.keith.fc.message records and broadcasts to chat

import type { ChatMessage } from "../../db/adapters/base";
import { FC_COLLECTION } from "../../shared/config";

const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe";

export interface FcMessageRecord {
  text: string;
  video?: { ref: { $link: string }; mimeType: string; size: number };
  blueskyPostUri?: string;
  expiresAt?: string;
  createdAt: string;
}

interface JetstreamCommitEvent {
  did: string;
  time_us: number;
  kind: "commit";
  commit: {
    rev: string;
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    record?: FcMessageRecord;
    cid?: string;
  };
}

type JetstreamEvent = JetstreamCommitEvent | { kind: "identity" | "account" };

type MessageHandler = (
  message: ChatMessage,
  operation: "create" | "delete",
) => void;

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let isShuttingDown = false;
let messageHandler: MessageHandler | null = null;
let handleResolver: ((did: string) => Promise<string | undefined>) | null =
  null;

function getReconnectDelay(): number {
  const baseDelay = 1000;
  const maxDelay = 30000;
  return Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
}

async function processEvent(event: JetstreamCommitEvent): Promise<void> {
  const { did, commit } = event;
  const { operation, collection, rkey, record } = commit;

  if (collection !== FC_COLLECTION) return;

  const uri = `at://${did}/${collection}/${rkey}`;

  try {
    if (operation === "delete") {
      if (messageHandler) {
        messageHandler(
          { id: rkey, text: "", userId: did, timestamp: 0 },
          "delete",
        );
      }
      console.log(`[jetstream] Deleted message: ${uri}`);
    } else if (operation === "create" || operation === "update") {
      if (!record) return;

      // Skip expired messages
      if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
        console.log(`[jetstream] Skipping expired message: ${uri}`);
        return;
      }

      const handle = handleResolver ? await handleResolver(did) : undefined;

      // Build video URL if there's a video blob
      let videoUrl: string | undefined;
      if (record.video?.ref?.$link) {
        // Resolve user's PDS from their DID document
        try {
          const didDocResponse = await fetch(`https://plc.directory/${did}`);
          if (didDocResponse.ok) {
            const didDoc = await didDocResponse.json();
            // Find the PDS service endpoint
            const pdsService = didDoc.service?.find(
              (s: any) =>
                s.id === "#atproto_pds" ||
                s.type === "AtprotoPersonalDataServer",
            );
            if (pdsService?.serviceEndpoint) {
              videoUrl = `${pdsService.serviceEndpoint}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(record.video.ref.$link)}`;
            }
          }
        } catch (err) {
          console.error(`[jetstream] Failed to resolve PDS for ${did}:`, err);
        }
      }

      const message: ChatMessage = {
        id: rkey,
        text: record.text,
        userId: did,
        userHandle: handle,
        timestamp: new Date(record.createdAt).getTime(),
        gif: videoUrl,
        blueskyPostUri: record.blueskyPostUri,
      };

      if (messageHandler) {
        messageHandler(message, "create");
      }
      console.log(
        `[jetstream] New message from ${handle || did}: ${record.text.substring(0, 50)}${videoUrl ? " (with video)" : ""}`,
      );
    }
  } catch (error) {
    console.error(`[jetstream] Error processing event:`, error);
  }
}

function connect(): void {
  if (isShuttingDown) return;

  const params = new URLSearchParams();
  params.append("wantedCollections", FC_COLLECTION);

  const url = `${JETSTREAM_URL}?${params}`;
  console.log(`[jetstream] Connecting to ${url}`);

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("[jetstream] Connected");
    reconnectAttempts = 0;
  };

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data as string) as JetstreamEvent;
      if (data.kind === "commit") {
        await processEvent(data as JetstreamCommitEvent);
      }
    } catch (error) {
      console.error("[jetstream] Error parsing message:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("[jetstream] WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log(`[jetstream] Disconnected (code: ${event.code})`);
    ws = null;

    if (!isShuttingDown) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;
  console.log(
    `[jetstream] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
  );

  reconnectTimeout = setTimeout(() => {
    connect();
  }, delay);
}

export interface JetstreamOptions {
  onMessage: MessageHandler;
  resolveHandle: (did: string) => Promise<string | undefined>;
}

export function startJetstream(options: JetstreamOptions): void {
  console.log(
    "[jetstream] Starting Jetstream consumer for is.keith.fc.message",
  );
  messageHandler = options.onMessage;
  handleResolver = options.resolveHandle;
  isShuttingDown = false;
  connect();
}

export function stopJetstream(): void {
  console.log("[jetstream] Stopping Jetstream consumer");
  isShuttingDown = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }
}
