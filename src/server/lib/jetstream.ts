// ABOUTME: Jetstream v2 WebSocket client for real-time ATProto events
// ABOUTME: Subscribes to is.keith.fc.message records, resuming from a saved cursor

import { getBlobCidString, jsonToLex, type JsonValue } from "@atproto/lex";
import type { ChatMessage } from "../../db/adapters/base.ts";
import { getSetting, setSetting } from "../../db/database.ts";
import { FC_COLLECTION } from "../../shared/config.ts";
import { blobUrl, resolveIdentity } from "./identity.ts";
import * as is from "../../lexicons/is.ts";

const JETSTREAM_URL =
  "wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents";
const CURSOR_KEY = "jetstream_cursor";
// Save the cursor at most this often; replaying a few seconds on restart is harmless
const CURSOR_SAVE_INTERVAL_MS = 5000;

interface JetstreamCommit {
  $type: "network.bsky.jetstream.subscribeEvents#commit";
  did: string;
  seq: number;
  operation: "create" | "update" | "delete";
  collection: string;
  rkey: string;
  record?: JsonValue;
}

interface JetstreamEnvelope {
  $type: string;
  payload?: { $type: string; seq?: number };
}

type MessageHandler = (
  message: ChatMessage,
  operation: "create" | "delete",
) => void;

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let isShuttingDown = false;
let messageHandler: MessageHandler | null = null;
let lastSeq: number | undefined;
let lastSavedAt = 0;

function getReconnectDelay(): number {
  const baseDelay = 1000;
  const maxDelay = 30000;
  return Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
}

function rememberCursor(seq: number | undefined): void {
  if (seq === undefined) return;
  lastSeq = seq;
  if (Date.now() - lastSavedAt > CURSOR_SAVE_INTERVAL_MS) {
    setSetting(CURSOR_KEY, String(seq));
    lastSavedAt = Date.now();
  }
}

async function processCommit(commit: JetstreamCommit): Promise<void> {
  const { did, operation, collection, rkey } = commit;
  if (collection !== FC_COLLECTION || !messageHandler) return;

  const uri = `at://${did}/${collection}/${rkey}`;

  if (operation === "delete") {
    messageHandler({ id: uri, text: "", userId: did, timestamp: 0 }, "delete");
    return;
  }

  const parsed = is.keith.fc.message.$safeParse(jsonToLex(commit.record ?? null));
  if (!parsed.success) {
    console.warn(`[jetstream] Ignoring invalid record ${uri}:`, parsed.reason);
    return;
  }
  const record = parsed.value;

  if (record.expiresAt && new Date(record.expiresAt) < new Date()) return;

  const identity = await resolveIdentity(did);

  messageHandler(
    {
      id: uri,
      text: record.text,
      userId: did,
      userHandle: identity?.handle,
      timestamp: new Date(record.createdAt).getTime(),
      videoUrl:
        record.video && identity
          ? blobUrl(identity.pds, did, getBlobCidString(record.video))
          : undefined,
      blueskyPostUri: record.blueskyPostUri,
      expiresAt: record.expiresAt
        ? new Date(record.expiresAt).getTime()
        : undefined,
    },
    "create",
  );
}

function connect(): void {
  if (isShuttingDown) return;

  const url = new URL(JETSTREAM_URL);
  url.searchParams.set("collections", FC_COLLECTION);
  url.searchParams.set("kinds", "commit");
  const cursor = lastSeq ?? getSetting(CURSOR_KEY);
  if (cursor) url.searchParams.set("cursor", String(cursor));

  console.log(`[jetstream] Connecting to ${url}`);
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("[jetstream] Connected");
    reconnectAttempts = 0;
  };

  ws.onmessage = async (event) => {
    try {
      const envelope = JSON.parse(event.data as string) as JetstreamEnvelope;
      const payload = envelope.payload;
      if (!payload) return;
      if (payload.$type === "network.bsky.jetstream.subscribeEvents#commit") {
        await processCommit(payload as JetstreamCommit);
      }
      rememberCursor(payload.seq);
    } catch (error) {
      console.error("[jetstream] Error handling event:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("[jetstream] WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log(`[jetstream] Disconnected (code: ${event.code})`);
    ws = null;
    if (!isShuttingDown) scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  const delay = getReconnectDelay();
  reconnectAttempts++;
  console.log(
    `[jetstream] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`,
  );
  reconnectTimeout = setTimeout(connect, delay);
}

export function startJetstream(onMessage: MessageHandler): void {
  console.log(`[jetstream] Starting Jetstream consumer for ${FC_COLLECTION}`);
  messageHandler = onMessage;
  isShuttingDown = false;
  connect();
}

export function stopJetstream(): void {
  console.log("[jetstream] Stopping Jetstream consumer");
  isShuttingDown = true;

  if (lastSeq !== undefined) setSetting(CURSOR_KEY, String(lastSeq));

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }
}
