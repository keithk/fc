/**
 * keith's friend club
 * a simple video chat app using bluesky oauth
 *
 * features:
 * - bluesky oauth login
 * - 2-second video recording
 * - websocket-based chat
 * - last 20 messages stored in sqlite
 */

import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { html } from "@elysiajs/html";
import { cookie } from "@elysiajs/cookie";
import { chatRoutes } from "./routes/chat";
import { authRoutes } from "./routes/auth";
import { historyRoutes } from "./routes/history";
import { oauthRoutes } from "./routes/oauth";
import { apiRoutes } from "./routes/api";
import {
  websocketHandler,
  setServerInstance,
  broadcastMessage,
  broadcastDeletion,
} from "./websocket";
import { startJetstream, stopJetstream } from "./lib/jetstream";
import { startCleanupJob, stopCleanupJob } from "./lib/expiration-cleanup";
import { APP_CONFIG, OAUTH_SCOPE_STRING_METADATA } from "../shared/config";
import { messageService, type ChatMessage } from "../db/messages";

// Get the origin URL, preferring BASE_URL env var for production
function getOrigin(headers: Record<string, string | undefined>): string {
  const baseUrl = process.env.BASE_URL;
  console.log(
    `[index] getOrigin: BASE_URL=${baseUrl}, host=${headers["host"]}`,
  );
  // If BASE_URL is set and not localhost, use it (production)
  if (
    baseUrl &&
    !baseUrl.includes("localhost") &&
    !baseUrl.includes("127.0.0.1")
  ) {
    return baseUrl;
  }

  // Otherwise derive from headers (development)
  const host = headers["host"] || "127.0.0.1:3891";
  const forwardedProto = headers["x-forwarded-proto"];
  const protocol =
    forwardedProto ||
    (host.includes("ngrok") || host.includes("keith.is") ? "https" : "http");
  return `${protocol}://${host}`;
}

const app = new Elysia()
  // Health check endpoint for container orchestration
  .get("/health", () => ({ status: "ok" }))
  .use(html())
  .use(cookie())
  .use(
    staticPlugin({
      assets: "src/public",
      prefix: "/public",
    }),
  )
  .use(chatRoutes)
  .use(authRoutes)
  .use(historyRoutes)
  .use(oauthRoutes)
  .use(apiRoutes)
  .use(websocketHandler)

  // bluesky oauth client metadata endpoint
  // this is required for oauth to work - bluesky fetches this to verify your app
  .get("/oauth-client-metadata.json", ({ headers }) => {
    const origin = getOrigin(headers);

    return Response.json(
      {
        client_id: `${origin}/oauth-client-metadata.json`,
        client_name: APP_CONFIG.appName,
        client_uri: origin,
        logo_uri: `${origin}/logo.png`,
        tos_uri: `${origin}/terms`,
        policy_uri: `${origin}/privacy`,
        redirect_uris: [`${origin}/oauth/callback`],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        scope: OAUTH_SCOPE_STRING_METADATA,
        token_endpoint_auth_method: "none",
        application_type: "web",
        dpop_bound_access_tokens: true,
      },
      {
        headers: {
          // prevent caching so oauth always gets fresh metadata
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  })

  // export all messages as json
  .get("/api/messages/export", ({ set }) => {
    const allMessages = messageService.getAllMessages();

    set.headers["Content-Type"] = "application/json";
    set.headers["Content-Disposition"] =
      'attachment; filename="friend-club-messages.json"';

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalMessages: allMessages.length,
        messages: allMessages,
      },
      null,
      2,
    );
  })
  .get("/privacy", () => {
    const timestamp = Date.now();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - keith's friend club 🐻</title>
        <link rel="stylesheet" href="/public/css/main.css?v=${timestamp}" />
      </head>
      <body>
        <main>
          <h1>🐻 keith's friend club</h1>
          <h2>Privacy Policy</h2>

          <!-- Keith's Intro with Speech Bubble -->
          <div style="display: flex; gap: 2rem; align-items: start; margin-bottom: 2rem; flex-wrap: wrap;">
            <img src="/public/keith.png?v=${timestamp}" alt="Keith" style="width: 200px; height: 200px; border: 2px solid black; border-radius: 8px; flex-shrink: 0;" />
            <div style="flex: 1; min-width: 300px; position: relative; background: white; border: 2px solid black; padding: 1.5rem; border-radius: 12px;">
              <div style="position: absolute; left: -12px; top: 40px; width: 0; height: 0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; border-right: 12px solid black;"></div>
              <div style="position: absolute; left: -10px; top: 40px; width: 0; height: 0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; border-right: 12px solid white;"></div>
              <p style="margin: 0; font-size: 1.1rem; line-height: 1.6;">
                hey! i'm <a href="https://keith.is" target="_blank" style="color: var(--pink); font-weight: 700; text-decoration: none;">keith</a> and i made this little club for fun. <strong>your data lives on your own Personal Data Server (PDS), not on my server.</strong> i just cache recent messages so the feed loads fast. you own your data and can delete it anytime.
              </p>
            </div>
          </div>

          <!-- Official Privacy Details -->
          <div style="padding: 2rem; background: #f5f5f5; border: 2px solid black; line-height: 1.8;">
            <h3 style="margin-top: 0;">Where Your Data Lives</h3>

            <p><strong>Your PDS (Primary Storage):</strong> When you post a message, it's written to your Personal Data Server using the <code>is.keith.fc.message</code> lexicon. This includes:</p>
            <ul style="margin-left: 2rem;">
              <li>Your message text</li>
              <li>Your 2-second video (as a blob on your PDS)</li>
              <li>Timestamp and expiration (if set)</li>
              <li>Link to Bluesky post (if you cross-posted)</li>
            </ul>

            <p><strong>My Server (Cache Only):</strong> I keep a temporary cache of recent messages in SQLite so the feed loads quickly. This is just a cache - your PDS is the source of truth. If my server restarts, it repopulates from the network.</p>

            <h3>You Control Your Data</h3>

            <p><strong>Delete Anytime:</strong> Use the 🗑️ button on any of your messages to delete it from your PDS. This removes it permanently.</p>

            <p><strong>Auto-Expiration:</strong> Set messages to auto-delete after 1 minute, 5 minutes, 30 minutes, 1 hour, or 24 hours. The server will delete expired messages from your PDS when you're logged in.</p>

            <p><strong>View Your Data:</strong> You can see exactly what's stored on your PDS using <a href="https://pdsls.dev/" target="_blank" style="color: var(--teal); font-weight: 700;">pdsls.dev</a>. Look for records under <code>is.keith.fc.message</code> in your repository.</p>

            <h3>Cross-Posting to Bluesky</h3>

            <p>If you check "Also post to Bluesky", your message is <em>also</em> posted to <code>app.bsky.feed.post</code>. This creates a regular Bluesky post that appears in your feed. Deleting from Friend Club will also delete the Bluesky post.</p>

            <h3>What I Don't Do</h3>

            <ul style="margin-left: 2rem;">
              <li>I don't store your data long-term - your PDS does</li>
              <li>I don't use analytics or tracking</li>
              <li>I don't sell or share your data</li>
              <li>I don't have access to your Bluesky password (OAuth only)</li>
            </ul>

            <p style="margin-top: 2rem; margin-bottom: 0;"><a href="/" style="color: var(--pink); font-weight: 700;">← Back to Friend Club</a></p>
          </div>
        </main>
      </body>
      </html>
    `;
  })

  // main app page
  .get("/", ({ headers }) => {
    const timestamp = Date.now();
    const origin = getOrigin(headers);

    // Get most recent message with a video for OpenGraph
    const recentMessages = messageService.getRecentMessages(10);
    const latestWithVideo = recentMessages.find((m) => m.videoUrl);

    // Build OpenGraph video tags if we have a recent video
    let ogVideoTags = "";
    if (latestWithVideo?.videoUrl) {
      ogVideoTags = `
        <meta property="og:video" content="${latestWithVideo.videoUrl}" />
        <meta property="og:video:type" content="video/mp4" />
        <meta property="og:video:width" content="720" />
        <meta property="og:video:height" content="540" />
        <meta name="twitter:card" content="player" />
        <meta name="twitter:player" content="${latestWithVideo.videoUrl}" />
        <meta name="twitter:player:width" content="720" />
        <meta name="twitter:player:height" content="540" />
      `;
    }

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>keith's friend club 🐻</title>

        <!-- SEO Meta Tags -->
        <meta name="description" content="Record 2-second videos, share messages with friends on the ATmosphere. Messages live on your Personal Data Server." />
        <meta name="keywords" content="bluesky, atproto, friend club, video chat, social" />
        <meta name="author" content="keith" />

        <!-- OpenGraph Tags -->
        <meta property="og:title" content="keith's friend club 🐻" />
        <meta property="og:description" content="Record 2-second videos, share messages with friends on the ATmosphere." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${origin}" />
        <meta property="og:image" content="${origin}/public/keith.png" />
        <meta property="og:site_name" content="keith's friend club" />
        ${ogVideoTags}

        <!-- Twitter Card Tags -->
        ${!latestWithVideo?.videoUrl ? '<meta name="twitter:card" content="summary" />' : ""}
        <meta name="twitter:title" content="keith's friend club 🐻" />
        <meta name="twitter:description" content="Record 2-second videos, share messages with friends on the ATmosphere." />
        <meta name="twitter:image" content="${origin}/public/keith.png" />

        <!-- Favicon -->
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👫</text></svg>" />

        <link rel="stylesheet" href="/public/css/main.css?v=${timestamp}" />
        <script src="/public/js/gif.js"></script>
      </head>
      <body>
        <main>
          <h1>🐻 keith's friend club</h1>

          <div class="instructions">
            <p><strong>How it works:</strong> Log in with Bluesky, record a 2-second video, write a message, and share it! Messages are stored on your <a href="https://linkring.lol/atmosphere" target="_blank" style="color: var(--pink);">Personal Data Server</a> (this is an explainer on another experiment i made). You can optionally cross-post to Bluesky, set messages to auto-delete, or delete them yourself anytime!</p>
            <p>This might remind of you an old website, <strong><a href='https://en.wikipedia.org/wiki/Meatspace_Chat' target='_blank'>meat space</a></strong>, which is really the same idea! I love meat space, make the internet more meat space!</p>
          </div>

          <div class="chat-container">
            <!-- Left Column: Auth + Camera + Message -->
            <div class="left-column">
              <!-- Auth Section -->
              <div id="auth-section" class="auth-section">
                <div id="login-form" class="login-form">
                  <input
                    type="text"
                    id="bluesky-handle"
                    placeholder="Enter your Bluesky handle (e.g., alice.bsky.social)"
                    class="text-input"
                  />
                  <button id="login-button" class="button button-primary">
                    🦋 Login with Bluesky
                  </button>
                </div>
                <div id="user-info" class="user-info" style="display:none;">
                  <span id="user-handle"></span>
                  <button id="logout-button" class="button">Logout</button>
                </div>
              </div>

              <!-- Camera Section -->
              <div id="camera-section" class="camera-section disabled">
                <div class="disabled-overlay">
                  <p>🔒 Log in to start recording</p>
                </div>
                <video id="video-preview" class="video-preview" autoplay playsinline></video>
                <canvas id="gif-canvas" style="display:none;"></canvas>
                <video id="gif-preview" class="gif-preview" style="display:none;" autoplay loop muted playsinline></video>
                <div id="countdown" class="countdown"></div>

                <div class="camera-controls">
                  <button id="start-camera" class="button" disabled>📷 Start Camera</button>
                  <button id="record-button" class="button" disabled>🔴 Record GIF</button>
                  <button id="clear-gif" class="button" style="display:none;">Clear</button>
                </div>
              </div>

              <!-- Message Input -->
              <div id="message-section" class="chat-input disabled">
                <div class="disabled-overlay">
                  <p>🔒 Log in to send messages</p>
                </div>
                <textarea
                  id="message-text"
                  class="text-input"
                  placeholder="Type your message (max 255 chars)..."
                  maxlength="255"
                  rows="3"
                  disabled
                ></textarea>
                <div class="input-footer">
                  <span id="char-count" class="char-count">0 / 255</span>
                  <select id="expires-in" class="expires-select" disabled>
                    <option value="">No expiration</option>
                    <option value="1m">Expires in 1 min</option>
                    <option value="5m">Expires in 5 min</option>
                    <option value="30m">Expires in 30 min</option>
                    <option value="1h">Expires in 1 hour</option>
                    <option value="24h">Expires in 24 hours</option>
                  </select>
                  <label class="post-to-bluesky">
                    <input type="checkbox" id="post-to-bluesky" disabled />
                    <span>Also post to Bluesky</span>
                  </label>
                  <button id="send-button" class="button button-primary" disabled>
                    Send Message
                  </button>
                </div>
              </div>

              <!-- Rate Limit Warning -->
              <div id="rate-limit-warning" class="warning" style="display:none;">
                ⏰ You can only send one message per minute
              </div>
            </div>

            <!-- Right Column: Messages -->
            <div class="right-column">
              <div class="messages-section">
                <h2>Recent Messages</h2>
                <div class="messages" id="messages-container"></div>
              </div>

              <!-- Your Messages Section (shown when logged in) -->
              <div id="your-messages-section" class="messages-section" style="display: none; margin-top: 2rem;">
                <h2>Your Messages</h2>
                <p class="your-messages-hint">Messages stored on your PDS. Click 🗑️ to delete.</p>
                <div class="messages" id="your-messages-container">
                  <p class="loading-your-messages">Loading your messages...</p>
                </div>
              </div>
            </div>
          </div>

          <footer style="margin-top: 2rem; padding-top: 1rem; border-top: 2px solid black; text-align: center;">
            <a href="/privacy" style="color: var(--teal); font-weight: 700; text-decoration: none;">Privacy Policy</a>
            <span style="margin: 0 1rem;">•</span>
            <a id="pdsls-link" href="https://pdsls.dev/" target="_blank" style="color: var(--teal); font-weight: 700; text-decoration: none; display: none;">View your data on pdsls.dev</a>
          </footer>
        </main>

        <script>
          // oauth config needs to match the current host (local, ngrok, or production)
          window.OAUTH_CONFIG = {
            clientId: '${origin}/oauth-client-metadata.json',
            redirectUri: '${origin}/oauth/callback',
            scopes: 'atproto app.bsky.feed.post com.atproto.repo.uploadBlob'
          }
        </script>
        <script src="/public/js/capture.js?v=${timestamp}"></script>
        <script src="/public/js/chat.js?v=${timestamp}"></script>
        <script src="/public/js/auth-oauth.js?v=${timestamp}"></script>
      </body>
      </html>
    `;
  });
const PORT = process.env.PORT || 3891;

app.listen(PORT);

// Store server reference for WebSocket broadcasts
setServerInstance(app);

// bun might choose a different port if 3891 is taken, so log the actual port
const port = app.server?.port || PORT;
console.log(`🐻 keith's friend club is running at http://127.0.0.1:${port}`);
if (process.env.BASE_URL) {
  console.log(`📍 BASE_URL: ${process.env.BASE_URL}`);
} else {
  console.log(
    `⚠️  important: use 127.0.0.1 (not localhost) for oauth to work properly`,
  );
}

// Resolve DID to handle for Jetstream events
async function resolveHandle(did: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://plc.directory/${did}`);
    if (response.ok) {
      const didDoc = await response.json();
      const alsoKnownAs = didDoc.alsoKnownAs?.[0];
      if (alsoKnownAs && alsoKnownAs.startsWith("at://")) {
        return alsoKnownAs.replace("at://", "");
      }
    }
  } catch {
    // Handle resolution failed
  }
  return undefined;
}

// Start Jetstream to listen for new messages
startJetstream({
  onMessage: (message: ChatMessage, operation: "create" | "delete") => {
    if (operation === "create") {
      // Save to local cache and broadcast to WebSocket clients
      messageService.saveMessage(message);
      broadcastMessage(message);
    } else if (operation === "delete") {
      // Remove from cache and broadcast deletion
      messageService.deleteMessage(message.id);
      broadcastDeletion(message.id);
    }
  },
  resolveHandle,
});

// Start expiration cleanup job
startCleanupJob();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  stopJetstream();
  stopCleanupJob();
  messageService.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down...");
  stopJetstream();
  stopCleanupJob();
  messageService.close();
  process.exit(0);
});
