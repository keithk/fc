// ABOUTME: Server-rendered HTML pages: the main club page and the privacy policy
// ABOUTME: Login state is rendered from the signed session cookie so the page never flashes

import { Elysia } from "elysia";
import { messageService } from "../../db/messages.ts";
import { getOrigin } from "../../shared/config.ts";
import { resolveIdentity } from "../lib/identity.ts";
import { SESSION_COOKIE } from "../lib/sessions.ts";
import { hasStoredSession } from "../lib/oauth-client.ts";

// Changes on every deploy, so browsers fetch fresh assets exactly once per release
const ASSET_VERSION = Date.now();

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function asset(path: string): string {
  return `/public/${path}?v=${ASSET_VERSION}`;
}

interface Viewer {
  did: string;
  handle: string;
}

async function viewerFrom(did: string | undefined): Promise<Viewer | null> {
  if (!did || !hasStoredSession(did)) return null;
  const identity = await resolveIdentity(did);
  return { did, handle: identity?.handle ?? did };
}

function layout({
  title,
  head = "",
  viewer,
  body,
}: {
  title: string;
  head?: string;
  viewer: Viewer | null;
  body: string;
}): string {
  const account = viewer
    ? `<div class="site-account">
        <a class="site-handle" href="https://bsky.app/profile/${escapeHtml(viewer.did)}">@${escapeHtml(viewer.handle)}</a>
        <form method="post" action="/oauth/logout"><button class="link-button" type="submit">Log out</button></form>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐻</text></svg>">
  <link rel="preload" href="${asset("fonts/GT-Maru-Bold.woff2")}" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${asset("css/main.css")}">
  ${head}
</head>
<body data-auth="${viewer ? "in" : "out"}"${viewer ? ` data-handle="${escapeHtml(viewer.handle)}"` : ""}>
  <header class="site-header">
    <a class="site-brand" href="/"><span class="prompt" aria-hidden="true">$</span> fc.keith.is</a>
    <span class="site-tagline">2 seconds of face, 255 characters of words</span>
    ${account}
  </header>
  ${body}
  <footer class="site-footer">
    <a href="/privacy">Privacy</a>
    ${viewer ? `<a href="https://pdsls.dev/at://${escapeHtml(viewer.did)}/is.keith.fc.message">See your data on pdsls.dev</a>` : ""}
    <a href="https://keith.is">Made by keith</a>
  </footer>
</body>
</html>`;
}

function stickers(): string {
  // Decorative emoji "stickers" in the hero, echoing keith.is
  const items = ["🐻", "🌈", "✨", "🍓", "🎥", "👋", "🐌", "💖"];
  return `<div class="stickers" aria-hidden="true">${items
    .map((emoji, i) => `<span class="sticker sticker-${i + 1}">${emoji}</span>`)
    .join("")}</div>`;
}

function loginForm(error: string | undefined): string {
  return `
    <form class="login" method="get" action="/oauth/login">
      <label for="handle" class="eyebrow">Your Bluesky handle</label>
      <div class="login-row">
        <input id="handle" name="handle" type="text" required autocomplete="username"
          autocapitalize="none" spellcheck="false" placeholder="alice.bsky.social">
        <button class="button button-primary" type="submit">Log in</button>
      </div>
      ${error ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>` : ""}
    </form>`;
}

function homePage(viewer: Viewer | null, origin: string, loginError?: string) {
  const latestWithVideo = messageService
    .getRecentMessages(10)
    .findLast((m) => m.videoUrl);

  const ogVideo = latestWithVideo?.videoUrl
    ? `<meta property="og:video" content="${escapeHtml(latestWithVideo.videoUrl)}">
  <meta property="og:video:type" content="video/mp4">`
    : "";

  const head = `
  <meta name="description" content="Record 2-second videos, share messages with friends on the ATmosphere. Messages live on your Personal Data Server.">
  <meta property="og:title" content="keith's friend club 🐻">
  <meta property="og:description" content="Record 2-second videos, share messages with friends on the ATmosphere.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(origin)}">
  <meta property="og:image" content="${escapeHtml(origin)}/public/keith.png">
  <meta property="og:site_name" content="keith's friend club">
  ${ogVideo}
  <meta name="twitter:card" content="summary">
  <script type="module" src="${asset("js/app.js")}"></script>`;

  const composer = viewer
    ? `<fc-composer>
        <form class="composer" method="post" action="/api/message" enctype="multipart/form-data">
          <fc-camera>
            <div class="camera-frame">
              <video class="camera-live" autoplay playsinline muted></video>
              <video class="camera-clip" loop muted playsinline hidden></video>
              <p class="camera-idle">Your camera shows up here</p>
              <span class="camera-countdown" aria-live="assertive"></span>
            </div>
            <div class="camera-controls">
              <button type="button" class="button" data-action="start">Start camera</button>
              <button type="button" class="button button-primary" data-action="record" hidden>Record 2 seconds</button>
              <button type="button" class="button" data-action="retake" hidden>Retake</button>
            </div>
          </fc-camera>

          <label for="message-text" class="eyebrow">Your message</label>
          <textarea id="message-text" name="text" maxlength="255" rows="3" required
            placeholder="say something nice"></textarea>
          <div class="composer-options">
            <span class="char-count" aria-live="polite">0 / 255</span>
            <label class="select-label">
              <span class="visually-hidden">Expiration</span>
              <select name="expiresIn" id="expires-in">
                <option value="">Keep it</option>
                <option value="1m">Delete after 1 min</option>
                <option value="5m">Delete after 5 min</option>
                <option value="30m">Delete after 30 min</option>
                <option value="1h">Delete after 1 hour</option>
                <option value="24h">Delete after 24 hours</option>
              </select>
            </label>
            <label class="checkbox">
              <input type="checkbox" name="postToBsky" value="true" id="post-to-bluesky">
              Also post to Bluesky
            </label>
          </div>
          <div class="composer-send">
            <button class="button button-primary button-big" type="submit" disabled>Send</button>
            <p class="composer-status" role="status"></p>
          </div>
        </form>
      </fc-composer>`
    : `<div class="composer composer-locked">
        <p class="composer-locked-title">Log in to say hi<span class="dot">.</span></p>
        <p>Your camera stays off until you're logged in and press start. Nothing records until you press record.</p>
      </div>`;

  const body = `
  <main>
    <section class="band band-pink hero">
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <p class="hero-hi">Welcome to</p>
          <h1 class="hero-title">keith's friend club<span class="dot">.</span></h1>
          <p class="lede">Log in with Bluesky, record a 2-second video, write a message, and share it! Messages are stored on your <a href="https://linkring.lol/atmosphere">Personal Data Server</a> (this is an explainer on another experiment i made). You can optionally cross-post to Bluesky, set messages to auto-delete, or delete them yourself anytime!</p>
          <p class="lede">This might remind of you an old website, <a href="https://en.wikipedia.org/wiki/Meatspace_Chat">meat space</a>, which is really the same idea! I love meat space, make the internet more meat space!</p>
          ${viewer ? "" : loginForm(loginError)}
        </div>
        ${stickers()}
      </div>
    </section>

    <section class="band band-butter">
      <div class="wrap club">
        <div class="club-compose">
          <h2 class="section-title">Say hi<span class="dot">.</span></h2>
          ${composer}
        </div>
        <div class="club-feed">
          <h2 class="section-title">Recent<span class="dot">.</span></h2>
          <fc-feed ${viewer ? `viewer="${escapeHtml(viewer.did)}"` : ""}>
            <ol class="feed" aria-live="polite">
              <li class="feed-empty">Loading the last 20 messages…</li>
            </ol>
          </fc-feed>
        </div>
      </div>
    </section>

    ${
      viewer
        ? `<section class="band band-plain">
      <div class="wrap">
        <h2 class="section-title">Your messages<span class="dot">.</span></h2>
        <p class="section-note">Everything you've posted here, read straight from your PDS. Deleting one removes it from your PDS and from Bluesky if you cross-posted it.</p>
        <fc-my-messages>
          <ol class="my-messages"><li class="feed-empty">Loading your messages…</li></ol>
        </fc-my-messages>
      </div>
    </section>`
        : ""
    }
  </main>`;

  return layout({ title: "keith's friend club 🐻", head, viewer, body });
}

function privacyPage(viewer: Viewer | null) {
  const body = `
  <main>
    <section class="band band-pink">
      <div class="wrap">
        <p class="hero-hi">keith's friend club</p>
        <h1 class="hero-title">Privacy<span class="dot">.</span></h1>
        <div class="intro">
          <img src="${asset("keith.png")}" alt="Keith" width="160" height="160">
          <p class="speech">hey! i'm <a href="https://keith.is">keith</a> and i made this little club for fun. <strong>your data lives on your own Personal Data Server (PDS), not on my server.</strong> i just cache recent messages so the feed loads fast. you own your data and can delete it anytime.</p>
        </div>
      </div>
    </section>

    <section class="band band-butter">
      <div class="wrap prose">
        <h2>Where your data lives</h2>
        <p><strong>Your PDS (primary storage):</strong> When you post a message, it's written to your Personal Data Server using the <code>is.keith.fc.message</code> lexicon. This includes:</p>
        <ul>
          <li>Your message text</li>
          <li>Your 2-second video (as a blob on your PDS)</li>
          <li>Timestamp and expiration (if set)</li>
          <li>Link to Bluesky post (if you cross-posted)</li>
        </ul>
        <p><strong>My server (cache only):</strong> I keep a temporary cache of recent messages in SQLite so the feed loads quickly. This is just a cache - your PDS is the source of truth.</p>

        <h2>Your login</h2>
        <p>You log in with Bluesky OAuth, so I never see your password. My server keeps your login session in its database so it can delete your expiring messages even when you're not on the site, and so a server restart doesn't log everyone out. A session lasts up to 180 days. Your browser only gets a signed cookie with your DID in it. Clicking "Log out" revokes that access and deletes the session from my server.</p>

        <h2>You control your data</h2>
        <p><strong>Delete anytime:</strong> Use the delete button on any of your messages to delete it from your PDS. This removes it permanently.</p>
        <p><strong>Auto-expiration:</strong> Set messages to auto-delete after 1 minute, 5 minutes, 30 minutes, 1 hour, or 24 hours. The server deletes expired messages from your PDS for you, even if you're not on the site.</p>
        <p><strong>View your data:</strong> You can see exactly what's stored on your PDS using <a href="https://pdsls.dev/">pdsls.dev</a>. Look for records under <code>is.keith.fc.message</code> in your repository.</p>

        <h2>Cross-posting to Bluesky</h2>
        <p>If you check "Also post to Bluesky", your message is <em>also</em> posted to <code>app.bsky.feed.post</code>. This creates a regular Bluesky post that appears in your feed. Deleting from Friend Club will also delete the Bluesky post.</p>

        <h2>What I don't do</h2>
        <ul>
          <li>I don't store your data long-term - your PDS does</li>
          <li>I don't use analytics or tracking</li>
          <li>I don't sell or share your data</li>
          <li>I don't have access to your Bluesky password (OAuth only)</li>
        </ul>

        <p><a href="/">← Back to Friend Club</a></p>
      </div>
    </section>
  </main>`;

  return layout({ title: "Privacy · keith's friend club", viewer, body });
}

export const pageRoutes = new Elysia()
  .get("/", async ({ headers, cookie, query }) => {
    const viewer = await viewerFrom(cookie[SESSION_COOKIE]?.value as string | undefined);
    return htmlResponse(homePage(viewer, getOrigin(headers), query.login_error));
  })
  .get("/privacy", async ({ cookie }) => {
    const viewer = await viewerFrom(cookie[SESSION_COOKIE]?.value as string | undefined);
    return htmlResponse(privacyPage(viewer));
  });
