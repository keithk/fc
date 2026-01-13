// ABOUTME: API routes for friend club messages
// ABOUTME: Handles posting to lexicon, fetching posts, and deletion

import { Elysia } from "elysia";
import { userSessionStore } from "../lib/oauth-client";
import { getActiveSession } from "../lib/sessions";
import { messageService } from "../../db/messages";
import { FC_COLLECTION } from "../../shared/config";
import { $ } from "bun";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Expiration options in milliseconds
const EXPIRATION_OPTIONS = {
  "1m": 1 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
} as const;

type ExpirationOption = keyof typeof EXPIRATION_OPTIONS | null;

export const apiRoutes = new Elysia({ prefix: "/api" })
  // Get recent messages from cache
  .get("/feed", () => {
    const messages = messageService.getRecentMessages(20);
    return { messages };
  })

  // Get current user's posts from their PDS
  .get("/my-posts", async ({ query }) => {
    const sessionId = query.sessionId;
    if (!sessionId) {
      return { error: "No session ID provided", posts: [] };
    }

    const session = getActiveSession(sessionId);
    if (!session) {
      return { error: "Invalid or expired session", posts: [] };
    }

    try {
      const response = await session.fetchHandler(
        `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(session.did)}&collection=${encodeURIComponent(FC_COLLECTION)}&limit=100`,
        { method: "GET" },
      );

      if (!response.ok) {
        const error = await response.text();
        return { error, posts: [] };
      }

      const data = await response.json();
      const posts = data.records.map((record: any) => ({
        uri: record.uri,
        rkey: record.uri.split("/").pop(),
        text: record.value.text,
        video: record.value.video,
        blueskyPostUri: record.value.blueskyPostUri,
        expiresAt: record.value.expiresAt,
        createdAt: record.value.createdAt,
      }));

      return { posts };
    } catch (error: any) {
      return { error: error.message, posts: [] };
    }
  })

  // Post a message to the custom lexicon (and optionally to Bluesky)
  .post("/message", async ({ body }) => {
    try {
      const { sessionId, text, gifDataUrl, postToBsky, expiresIn } = body as {
        sessionId: string;
        text: string;
        gifDataUrl?: string;
        postToBsky?: boolean;
        expiresIn?: ExpirationOption;
      };

      if (!sessionId) {
        return { success: false, error: "No session ID provided" };
      }

      const session = getActiveSession(sessionId);
      if (!session) {
        return { success: false, error: "Invalid or expired session" };
      }

      let videoBlob = undefined;

      // Upload video if provided
      if (gifDataUrl) {
        const base64Data = gifDataUrl.split(",")[1];
        const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const mimeType = gifDataUrl.split(";")[0].split(":")[1];

        let videoBytes = bytes;
        let videoMimeType = mimeType;

        // Convert webm to mp4 if needed
        if (mimeType === "video/webm") {
          const tmpInputPath = join(tmpdir(), `fc-input-${Date.now()}.webm`);
          const tmpOutputPath = join(tmpdir(), `fc-output-${Date.now()}.mp4`);

          try {
            await writeFile(tmpInputPath, bytes);
            await $`ffmpeg -i ${tmpInputPath} -c:v libx264 -preset fast -crf 28 -an -movflags +faststart ${tmpOutputPath}`.quiet();

            const mp4File = Bun.file(tmpOutputPath);
            videoBytes = new Uint8Array(await mp4File.arrayBuffer());
            videoMimeType = "video/mp4";

            await unlink(tmpInputPath);
            await unlink(tmpOutputPath);
          } catch (error) {
            try {
              await unlink(tmpInputPath);
              await unlink(tmpOutputPath);
            } catch {}
            return { success: false, error: "Failed to convert video to MP4" };
          }
        }

        // Upload blob to user's PDS
        console.log(
          `[api] Uploading video blob (${videoBytes.length} bytes, ${videoMimeType}) to PDS...`,
        );
        const uploadStart = Date.now();
        let uploadResponse;
        try {
          uploadResponse = await session.fetchHandler(
            "/xrpc/com.atproto.repo.uploadBlob",
            {
              method: "POST",
              headers: { "Content-Type": videoMimeType },
              body: videoBytes,
            },
          );
          console.log(
            `[api] Upload completed in ${Date.now() - uploadStart}ms, status: ${uploadResponse.status}`,
          );
        } catch (uploadError: any) {
          console.error(
            `[api] Upload fetch error after ${Date.now() - uploadStart}ms:`,
            uploadError,
          );
          return {
            success: false,
            error: `Upload failed: ${uploadError.message}`,
          };
        }

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(
            `[api] Failed to upload video: ${uploadResponse.status} ${errorText}`,
          );
          return {
            success: false,
            error: `Failed to upload video: ${errorText}`,
          };
        }

        const uploadData = await uploadResponse.json();
        console.log(`[api] Video uploaded successfully:`, uploadData.blob);
        videoBlob = uploadData.blob;
      }

      // Calculate expiration time
      const expiresAt = expiresIn
        ? new Date(Date.now() + EXPIRATION_OPTIONS[expiresIn]).toISOString()
        : undefined;

      // Create the record for our custom lexicon
      const fcRecord: any = {
        text,
        createdAt: new Date().toISOString(),
      };

      if (videoBlob) {
        fcRecord.video = videoBlob;
      }

      if (expiresAt) {
        fcRecord.expiresAt = expiresAt;
      }

      // Optionally post to Bluesky first so we can get the URI
      let blueskyPostUri: string | undefined;

      if (postToBsky) {
        const bskyRecord: any = {
          $type: "app.bsky.feed.post",
          text: text + "\n\nvia keith's friend club: https://fc.keith.is",
          createdAt: new Date().toISOString(),
          langs: ["en"],
          facets: [
            {
              index: {
                byteStart: new TextEncoder().encode(
                  text + "\n\nvia keith's friend club: ",
                ).length,
                byteEnd: new TextEncoder().encode(
                  text + "\n\nvia keith's friend club: https://fc.keith.is",
                ).length,
              },
              features: [
                {
                  $type: "app.bsky.richtext.facet#link",
                  uri: "https://fc.keith.is",
                },
              ],
            },
          ],
        };

        if (videoBlob) {
          bskyRecord.embed = {
            $type: "app.bsky.embed.video",
            video: videoBlob,
            aspectRatio: { width: 640, height: 480 },
          };
        }

        const bskyResponse = await session.fetchHandler(
          "/xrpc/com.atproto.repo.createRecord",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              repo: session.did,
              collection: "app.bsky.feed.post",
              record: bskyRecord,
            }),
          },
        );

        if (bskyResponse.ok) {
          const bskyData = await bskyResponse.json();
          blueskyPostUri = bskyData.uri;
          fcRecord.blueskyPostUri = blueskyPostUri;
        }
        // If Bluesky post fails, we still continue with the FC post
      }

      // Create record in our custom lexicon
      const createResponse = await session.fetchHandler(
        "/xrpc/com.atproto.repo.createRecord",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: session.did,
            collection: FC_COLLECTION,
            record: fcRecord,
          }),
        },
      );

      if (!createResponse.ok) {
        const error = await createResponse.text();
        return { success: false, error };
      }

      const data = await createResponse.json();
      const rkey = data.uri.split("/").pop();

      // Get user handle for response
      const sessionData = userSessionStore.get(sessionId);
      const handle = sessionData?.handle || session.did;

      // Build Bluesky post URL if we cross-posted
      let blueskyPostUrl: string | undefined;
      if (blueskyPostUri) {
        const postId = blueskyPostUri.split("/").pop();
        blueskyPostUrl = `https://bsky.app/profile/${handle}/post/${postId}`;
      }

      return {
        success: true,
        uri: data.uri,
        rkey,
        blueskyPostUri,
        blueskyPostUrl,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  })

  // Delete a message from the user's PDS
  .delete("/message/:rkey", async ({ params, query }) => {
    const { rkey } = params;
    const sessionId = query.sessionId;

    if (!sessionId) {
      return { success: false, error: "No session ID provided" };
    }

    const session = getActiveSession(sessionId);
    if (!session) {
      return { success: false, error: "Invalid or expired session" };
    }

    try {
      const response = await session.fetchHandler(
        "/xrpc/com.atproto.repo.deleteRecord",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: session.did,
            collection: FC_COLLECTION,
            rkey,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      // Also remove from local cache
      messageService.deleteMessage(rkey);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
