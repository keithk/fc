// ABOUTME: Expiration cleanup job for friend club messages
// ABOUTME: Deletes expired messages from users' PDSes using their stored OAuth sessions

import { Client } from "@atproto/lex";
import { messageService } from "../../db/messages.ts";
import { getOrigin } from "../../shared/config.ts";
import { restoreSession } from "./sessions.ts";
import * as is from "../../lexicons/is.ts";

const CLEANUP_INTERVAL = 60 * 1000; // 1 minute, the shortest expiration option

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function cleanupExpiredMessages(): Promise<void> {
  const expiredMessages = messageService.getExpiredMessages();
  if (expiredMessages.length === 0) return;

  console.log(`[cleanup] Found ${expiredMessages.length} expired messages`);
  const origin = getOrigin({});

  for (const message of expiredMessages) {
    const rkey = message.id.split("/").pop()!;
    const session = await restoreSession(origin, message.userId);

    if (session) {
      try {
        await new Client(session).delete(is.keith.fc.message, { rkey });
        console.log(`[cleanup] Deleted expired message ${message.id}`);
      } catch (error) {
        console.error(`[cleanup] Failed to delete ${message.id}:`, error);
        continue;
      }
    } else {
      // Signed out or revoked access: we can't delete it, but the feed shouldn't show it
      console.log(`[cleanup] No session for ${message.userId}, dropping ${message.id} from cache`);
    }

    messageService.deleteMessage(message.id);
  }
}

export function startCleanupJob(): void {
  console.log("[cleanup] Starting expiration cleanup job (every minute)");
  cleanupExpiredMessages().catch(console.error);
  cleanupTimer = setInterval(() => {
    cleanupExpiredMessages().catch(console.error);
  }, CLEANUP_INTERVAL);
}

export function stopCleanupJob(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log("[cleanup] Stopped expiration cleanup job");
  }
}
