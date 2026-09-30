// ABOUTME: API routes for friend club messages
// ABOUTME: Handles posting to lexicon, fetching posts, and deletion

import { Elysia, t } from "elysia";
import { Client, getBlobCidString, l } from "@atproto/lex";
import { messageService } from "../../db/messages.ts";
import { getOrigin } from "../../shared/config.ts";
import { restoreSession, SESSION_COOKIE } from "../lib/sessions.ts";
import { blobUrl, resolveIdentity } from "../lib/identity.ts";
import { toMp4 } from "../lib/video.ts";
import * as is from "../../lexicons/is.ts";
import * as app from "../../lexicons/app.ts";

// Expiration options in milliseconds
const EXPIRATION_OPTIONS = {
  "1m": 1 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
} as const;

type ExpirationOption = keyof typeof EXPIRATION_OPTIONS;

const CROSS_POST_LINK = "https://fc.keith.is";
const CROSS_POST_SUFFIX = "\n\nvia keith's friend club: ";

function rkeyOf(uri: string): string {
  return uri.split("/").pop()!;
}

function crossPostRecord(
  text: string,
  video: l.BlobRef,
  aspectRatio: { width: number; height: number },
) {
  const prefix = text + CROSS_POST_SUFFIX;
  const encoder = new TextEncoder();
  return app.bsky.feed.post.$build({
    text: prefix + CROSS_POST_LINK,
    createdAt: l.currentDatetimeString(),
    langs: ["en"],
    facets: [
      {
        index: {
          byteStart: encoder.encode(prefix).length,
          byteEnd: encoder.encode(prefix + CROSS_POST_LINK).length,
        },
        features: [
          app.bsky.richtext.facet.link.$build({
            uri: CROSS_POST_LINK as l.UriString,
          }),
        ],
      },
    ],
    embed: app.bsky.embed.video.$build({ video, aspectRatio }),
  });
}

export const apiRoutes = new Elysia({ prefix: "/api" })
  .resolve(async ({ cookie, headers }) => {
    const did = cookie[SESSION_COOKIE]?.value as string | undefined;
    const session = await restoreSession(getOrigin(headers), did);
    return { session };
  })

  // Get recent messages from cache
  .get("/feed", () => {
    const messages = messageService.getRecentMessages(20);
    return { messages };
  })

  // Who is logged in
  .get("/me", async ({ session, status }) => {
    if (!session) return status(401, { error: "Not logged in" });
    const identity = await resolveIdentity(session.did);
    return { did: session.did, handle: identity?.handle ?? session.did };
  })

  // Get current user's posts from their PDS
  .get("/my-posts", async ({ session, status }) => {
    if (!session) return status(401, { error: "Not logged in", posts: [] });

    try {
      const client = new Client(session);
      const identity = await resolveIdentity(session.did);
      const { records } = await client.list(is.keith.fc.message, {
        limit: 100,
      });

      // Records that fail schema validation are skipped
      const posts = records.flatMap((record) =>
        record.valid
          ? [
              {
                uri: record.uri,
                rkey: rkeyOf(record.uri),
                text: record.value.text,
                videoUrl:
                  record.value.video && identity
                    ? blobUrl(identity.pds, session.did, getBlobCidString(record.value.video))
                    : undefined,
                blueskyPostUri: record.value.blueskyPostUri,
                expiresAt: record.value.expiresAt,
                createdAt: record.value.createdAt,
              },
            ]
          : [],
      );

      return { posts };
    } catch (error: any) {
      return status(502, { error: error.message, posts: [] });
    }
  })

  // Post a message to the custom lexicon (and optionally to Bluesky)
  .post(
    "/message",
    async ({ session, body, status }) => {
      if (!session) return status(401, { error: "Not logged in" });

      // Lexicon lengths count UTF-8 bytes, so emoji-heavy text can pass the form's
      // character limit and still be invalid. Check before uploading or cross-posting.
      const textCheck = is.keith.fc.message.$safeValidate({
        $type: is.keith.fc.message.$type,
        text: body.text,
        createdAt: l.currentDatetimeString(),
      });
      if (!textCheck.success) {
        return status(422, { error: "That message is too long. Emoji count as several characters." });
      }

      const client = new Client(session);

      let video: Awaited<ReturnType<typeof toMp4>>;
      try {
        video = await toMp4(new Uint8Array(await body.video.arrayBuffer()));
      } catch (error) {
        console.error("[api] ffmpeg conversion failed:", error);
        return status(422, { error: "Couldn't convert your video to MP4" });
      }

      let videoBlob: l.BlobRef;
      try {
        const upload = await client.uploadBlob(video.bytes, {
          encoding: "video/mp4",
        });
        videoBlob = upload.body.blob;
      } catch (error: any) {
        console.error("[api] Video upload failed:", error);
        return status(502, { error: `Video upload failed: ${error.message}` });
      }

      // Post to Bluesky first so the message can link to it
      let blueskyPostUri: l.AtUriString | undefined;
      if (body.postToBsky === "true") {
        try {
          const post = await client.create(
            app.bsky.feed.post,
            crossPostRecord(body.text, videoBlob, {
              width: video.width,
              height: video.height,
            }),
          );
          blueskyPostUri = post.uri;
        } catch (error) {
          console.error("[api] Cross-post to Bluesky failed:", error);
        }
      }

      const expiresIn = body.expiresIn as ExpirationOption | undefined;
      const expiresAt = expiresIn
        ? l.toDatetimeString(new Date(Date.now() + EXPIRATION_OPTIONS[expiresIn]))
        : undefined;

      const record = is.keith.fc.message.$build({
        text: body.text,
        video: videoBlob,
        blueskyPostUri,
        expiresAt,
        createdAt: l.currentDatetimeString(),
      });
      try {
        const created = await client.create(is.keith.fc.message, record);

        let blueskyPostUrl: string | undefined;
        if (blueskyPostUri) {
          blueskyPostUrl = `https://bsky.app/profile/${session.did}/post/${rkeyOf(blueskyPostUri)}`;
        }

        return {
          success: true,
          uri: created.uri,
          rkey: rkeyOf(created.uri),
          blueskyPostUri,
          blueskyPostUrl,
        };
      } catch (error: any) {
        return status(502, { error: error.message });
      }
    },
    {
      body: t.Object({
        text: t.String({ maxLength: 255 }),
        video: t.File({ maxSize: 10 * 1024 * 1024 }),
        postToBsky: t.Optional(t.String()),
        expiresIn: t.Optional(
          t.Union(
            Object.keys(EXPIRATION_OPTIONS).map((key) => t.Literal(key)),
          ),
        ),
      }),
    },
  )

  // Delete a message from the user's PDS (and Bluesky if cross-posted)
  .delete("/message/:rkey", async ({ session, params, status }) => {
    if (!session) return status(401, { error: "Not logged in" });

    const client = new Client(session);
    const { rkey } = params;

    try {
      // Delete the cross-posted Bluesky post first, if there is one
      const record = await client
        .get(is.keith.fc.message, { rkey })
        .catch(() => null);
      const blueskyPostUri = record?.value.blueskyPostUri;
      if (blueskyPostUri) {
        await client
          .delete(app.bsky.feed.post, { rkey: rkeyOf(blueskyPostUri) })
          .catch((error) =>
            console.error("[api] Failed to delete Bluesky post:", error),
          );
      }

      await client.delete(is.keith.fc.message, { rkey });

      // Jetstream will also report the delete; removing now keeps the UI snappy
      messageService.deleteMessage(
        `at://${session.did}/${is.keith.fc.message.$type}/${rkey}`,
      );

      return { success: true };
    } catch (error: any) {
      return status(502, { error: error.message });
    }
  });
