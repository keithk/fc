/**
 * bluesky oauth routes
 * handles the oauth flow and posting to bluesky
 *
 * flow:
 * 1. /login - user enters handle, we redirect to bluesky oauth
 * 2. /callback - bluesky redirects back with code, we exchange for tokens
 * 3. /post-to-bluesky - user posts a message (with video) to bluesky
 */

import { Elysia } from "elysia";
import { getOAuthClient, userSessionStore } from "../lib/oauth-client";
import { setActiveSession, getActiveSession } from "../lib/sessions";
import { OAUTH_SCOPE_STRING, APP_CONFIG } from "../../shared/config";
import { $ } from "bun";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Get the origin URL, preferring BASE_URL env var for production
function getOrigin(headers: Record<string, string | undefined>): string {
  // If BASE_URL is set and not localhost, use it (production)
  if (
    process.env.BASE_URL &&
    !process.env.BASE_URL.includes("localhost") &&
    !process.env.BASE_URL.includes("127.0.0.1")
  ) {
    return process.env.BASE_URL;
  }

  // Otherwise derive from headers (development)
  const host = headers["host"] || "127.0.0.1:3891";
  const forwardedProto = headers["x-forwarded-proto"];
  const protocol =
    forwardedProto ||
    (host.includes("ngrok") || host.includes("keith.is") ? "https" : "http");
  return `${protocol}://${host}`;
}

export const oauthRoutes = new Elysia({ prefix: "/oauth" })
  .get("/login", async ({ query, headers, set }) => {
    const handle = query.handle;
    if (!handle) {
      return new Response("Missing handle", { status: 400 });
    }

    const origin = getOrigin(headers);

    try {
      const client = await getOAuthClient(origin);

      // add .bsky.social if needed
      const handleToResolve = handle.includes(".")
        ? handle
        : handle + ".bsky.social";

      // resolve handle to DID
      const resolveResponse = await fetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleToResolve)}`,
      );
      if (!resolveResponse.ok) {
        return new Response("Could not resolve handle", { status: 400 });
      }

      const { did } = await resolveResponse.json();

      // create authorization url
      const authUrl = await client.authorize(did, {
        scope: OAUTH_SCOPE_STRING,
        state: crypto.randomUUID(),
      });

      // store session for callback
      const sessionId = crypto.randomUUID();
      userSessionStore.set(sessionId, { handle: handleToResolve, did });

      // set session cookie
      set.cookie = {
        sid: {
          value: sessionId,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 600,
          path: "/",
        },
      };

      // redirect to bluesky oauth
      set.redirect = authUrl.toString();
      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
        },
      });
    } catch (error) {
      return new Response(`OAuth initialization failed: ${error.message}`, {
        status: 500,
      });
    }
  })

  .get("/callback", async ({ query, headers, cookie }) => {
    const code = query.code;
    const state = query.state;
    const iss = query.iss;

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    if (!iss) {
      return new Response("Missing issuer (iss) parameter", { status: 400 });
    }

    const origin = getOrigin(headers);

    try {
      const client = await getOAuthClient(origin);

      // get session from cookie
      const sessionId = cookie?.sid;
      const sessionData = sessionId ? userSessionStore.get(sessionId) : null;

      // exchange authorization code for access token
      const params = new URLSearchParams();
      if (code) params.set("code", code);
      if (state) params.set("state", state);
      if (iss) params.set("iss", iss);

      const result = await client.callback(params);
      const { session } = result;

      const did = session.did || sessionData?.did;

      // resolve handle from DID if we don't have it
      let handle = sessionData?.handle;
      if (!handle) {
        try {
          const didDocResponse = await fetch(`https://plc.directory/${did}`);
          if (didDocResponse.ok) {
            const didDoc = await didDocResponse.json();
            const alsoKnownAs = didDoc.alsoKnownAs?.[0];
            if (alsoKnownAs && alsoKnownAs.startsWith("at://")) {
              handle = alsoKnownAs.replace("at://", "");
            }
          }
        } catch (e) {
          // handle resolution failed, use DID
        }
      }

      // store oauth session for server-side posting
      const clientSessionId = crypto.randomUUID();
      setActiveSession(clientSessionId, session);

      // update user session with handle
      if (handle) {
        const existingData = userSessionStore.get(sessionId) || {};
        userSessionStore.set(sessionId, { ...existingData, handle });
      }

      // create session object for client (no access token - server handles posting)
      const clientSession = {
        did,
        handle: handle || did,
        sessionId: clientSessionId,
        authenticated: true,
        timestamp: Date.now(),
      };

      // return html that stores session and redirects
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>transferring to friend zone...</title>
          <meta charset="UTF-8">
          <style>
            @font-face {
              font-family: 'GT Maru Emoji';
              src: url('https://keith.is/assets/fonts/GT-Maru/GT-Maru-Emoji-Color.woff2') format('woff2');
            }
            body {
              font-family: 'GT Maru', system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: #fafafa;
            }
            .loading {
              background: white;
              padding: 2rem;
              border: 2px solid black;
              text-align: center;
            }
            h1 {
              font-family: 'GT Maru Emoji', 'GT Maru', system-ui;
              color: #ff69b4;
              margin: 0 0 1rem 0;
              font-size: 2rem;
            }
            p { color: #333; }
          </style>
        </head>
        <body>
          <div class="loading">
            <h1>🐻 transferring to friend zone...</h1>
          </div>
          <script>
            const session = ${JSON.stringify(clientSession)};
            localStorage.setItem('bsky_session', JSON.stringify(session));
            setTimeout(() => {
              window.location.href = '/';
            }, 1000);
          </script>
        </body>
        </html>
      `;
    } catch (error) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>oops!</title>
          <meta charset="UTF-8">
          <style>
            @font-face {
              font-family: 'GT Maru Emoji';
              src: url('https://keith.is/assets/fonts/GT-Maru/GT-Maru-Emoji-Color.woff2') format('woff2');
            }
            body {
              font-family: 'GT Maru', system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: #fafafa;
            }
            .error {
              background: white;
              padding: 2rem;
              border: 2px solid black;
              text-align: center;
              max-width: 500px;
            }
            h1 {
              font-family: 'GT Maru Emoji', 'GT Maru', system-ui;
              color: #ff69b4;
              margin: 0 0 1rem 0;
              font-size: 2rem;
            }
            p { color: #333; margin: 0.5rem 0; }
            .error-msg { font-size: 0.9em; color: #666; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>🐻 oops!</h1>
            <p>There was an error during authentication.</p>
            <p class="error-msg">${error.message}</p>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          </script>
        </body>
        </html>
      `;
    }
  })

  .post("/post-to-bluesky", async ({ body }) => {
    try {
      const { sessionId, text, gifDataUrl } = body as any;

      if (!sessionId) {
        return { success: false, error: "No session ID provided" };
      }

      const session = getActiveSession(sessionId);
      if (!session) {
        return { success: false, error: "Invalid or expired session" };
      }

      let embed = undefined;

      // upload video/gif if provided
      if (gifDataUrl) {
        const base64Data = gifDataUrl.split(",")[1];
        const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

        const mimeType = gifDataUrl.split(";")[0].split(":")[1];
        const isVideo = mimeType.startsWith("video/");

        if (isVideo) {
          let videoBytes = bytes;
          let videoMimeType = mimeType;

          // convert webm to mp4 (bluesky requires mp4 for videos)
          if (mimeType === "video/webm") {
            const tmpInputPath = join(
              tmpdir(),
              `facechat-input-${Date.now()}.webm`,
            );
            const tmpOutputPath = join(
              tmpdir(),
              `facechat-output-${Date.now()}.mp4`,
            );

            try {
              await writeFile(tmpInputPath, bytes);
              await $`ffmpeg -i ${tmpInputPath} -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart ${tmpOutputPath}`.quiet();

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
              return {
                success: false,
                error: "Failed to convert video to MP4",
              };
            }
          }

          // upload video blob
          const uploadResponse = await session.fetchHandler(
            "/xrpc/com.atproto.repo.uploadBlob",
            {
              method: "POST",
              headers: {
                "Content-Type": videoMimeType,
              },
              body: videoBytes,
            },
          );

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();

            embed = {
              $type: "app.bsky.embed.video",
              video: uploadData.blob,
              aspectRatio: {
                width: 640,
                height: 480,
              },
            };
          } else {
            return { success: false, error: "Failed to upload video" };
          }
        } else {
          // upload gif as image
          const uploadResponse = await session.fetchHandler(
            "/xrpc/com.atproto.repo.uploadBlob",
            {
              method: "POST",
              headers: {
                "Content-Type": mimeType,
              },
              body: bytes,
            },
          );

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();

            embed = {
              $type: "app.bsky.embed.images",
              images: [
                {
                  alt: "Face Chat GIF",
                  image: uploadData.blob,
                  aspectRatio: {
                    width: 640,
                    height: 480,
                  },
                },
              ],
            };
          } else {
            return { success: false, error: "Failed to upload media" };
          }
        }
      }

      // create post record with link back to friend club
      const record = {
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

      if (embed) {
        record.embed = embed;
      }

      // post to bluesky
      const createResponse = await session.fetchHandler(
        "/xrpc/com.atproto.repo.createRecord",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repo: session.did,
            collection: "app.bsky.feed.post",
            record: record,
          }),
        },
      );

      if (createResponse.ok) {
        const data = await createResponse.json();
        const postId = data.uri.split("/").pop();
        const handle = userSessionStore.get(sessionId)?.handle || session.did;
        const postUrl = `https://bsky.app/profile/${handle}/post/${postId}`;
        return { success: true, uri: data.uri, url: postUrl };
      } else {
        const error = await createResponse.text();
        return { success: false, error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
