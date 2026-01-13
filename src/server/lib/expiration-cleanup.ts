// ABOUTME: Expiration cleanup job for friend club messages
// ABOUTME: Deletes expired messages from users' PDSes when they have active sessions

import { messageService } from "../../db/messages";
import { getAllActiveSessions } from "./sessions";

const FC_COLLECTION = "is.keith.fc.message";
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function cleanupExpiredMessages(): Promise<void> {
  const expiredMessages = messageService.getExpiredMessages();
  if (expiredMessages.length === 0) {
    return;
  }

  console.log(`[cleanup] Found ${expiredMessages.length} expired messages`);

  const activeSessions = getAllActiveSessions();

  for (const message of expiredMessages) {
    // Find an active session for this user
    let userSession = null;
    for (const [, session] of activeSessions) {
      if (session.did === message.userId) {
        userSession = session;
        break;
      }
    }

    if (!userSession) {
      console.log(`[cleanup] No active session for ${message.userId}, skipping ${message.id}`);
      continue;
    }

    try {
      // Delete from user's PDS
      const response = await userSession.fetchHandler(
        "/xrpc/com.atproto.repo.deleteRecord",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: userSession.did,
            collection: FC_COLLECTION,
            rkey: message.id,
          }),
        }
      );

      if (response.ok) {
        console.log(`[cleanup] Deleted expired message ${message.id} from ${message.userId}`);
        // Remove from local cache
        messageService.deleteMessage(message.id);
      } else {
        const error = await response.text();
        console.error(`[cleanup] Failed to delete ${message.id}: ${error}`);
      }
    } catch (error) {
      console.error(`[cleanup] Error deleting ${message.id}:`, error);
    }
  }
}

export function startCleanupJob(): void {
  console.log("[cleanup] Starting expiration cleanup job (every 5 minutes)");

  // Run immediately on startup
  cleanupExpiredMessages().catch(console.error);

  // Then run periodically
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

// Clean up a specific user's expired messages (called on login)
export async function cleanupUserExpiredMessages(session: any): Promise<void> {
  try {
    // List user's records
    const response = await session.fetchHandler(
      `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(session.did)}&collection=${encodeURIComponent(FC_COLLECTION)}&limit=100`,
      { method: "GET" }
    );

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const now = new Date();

    for (const record of data.records) {
      if (record.value.expiresAt && new Date(record.value.expiresAt) <= now) {
        const rkey = record.uri.split("/").pop();

        try {
          await session.fetchHandler(
            "/xrpc/com.atproto.repo.deleteRecord",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: session.did,
                collection: FC_COLLECTION,
                rkey,
              }),
            }
          );
          console.log(`[cleanup] Deleted user's expired message ${rkey}`);
          messageService.deleteMessage(rkey);
        } catch (error) {
          console.error(`[cleanup] Failed to delete user message ${rkey}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("[cleanup] Error cleaning user messages:", error);
  }
}
