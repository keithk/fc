# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

keith's friend club — an ephemeral video chat app on the AT Protocol (Bluesky). Users log in with Bluesky OAuth, record a 2-second webcam video, write a message, and share it. Messages are stored on the user's PDS (Personal Data Server); the server's SQLite is only a cache.

## Commands

```bash
bun run dev          # dev server with watch mode (port 3891)
bun run start        # production server
bun run db:setup     # initialize SQLite database
```

No build step. Bun runs TypeScript directly. Frontend is vanilla JS served as static files.

**Prerequisites:** Bun, ffmpeg (for webm-to-mp4 conversion). Bluesky OAuth requires a public URL (ngrok/cloudflare tunnel for local dev).

## Architecture

### PDS-First Data Flow

This is the most important thing to understand. The server is NOT the source of truth:

1. `POST /api/message` uploads video blob + creates `is.keith.fc.message` record on the **user's PDS**
2. Jetstream (Bluesky firehose) detects the new record and fires it back to the server
3. Server saves to SQLite cache and broadcasts via WebSocket to all clients

Deleting works the same way — delete from PDS first, Jetstream notifies, server removes from cache.

### Key Components

- **Elysia routes** (`src/server/routes/`) — `api.ts` (feed, messages, CRUD), `oauth.ts` (login/callback/cross-post)
- **Jetstream client** (`src/server/lib/jetstream.ts`) — subscribes to `is.keith.fc.message` events from the Bluesky firehose
- **WebSocket** (`src/server/websocket.ts`) — pub/sub on `"chat"` topic, sends last 20 messages on connect
- **Storage adapter** (`src/db/`) — interface pattern with SQLite (default) and JSON adapters
- **OAuth sessions** (`src/server/lib/sessions.ts`) — in-memory `Map`, lost on restart
- **Expiration cleanup** (`src/server/lib/expiration-cleanup.ts`) — periodic job deleting expired messages from PDSes

### Frontend

Vanilla JS in `src/public/js/`. No modules, no build. Script load order matters (managed in the HTML template in `src/server/index.ts`). Key files: `chat.js` (WebSocket client), `auth-oauth.js` (auth UI + API calls), `capture.js` (webcam + MediaRecorder).

Static files are served with cache-busting `?v=${timestamp}` query strings.

### Custom ATProto Lexicon

`is.keith.fc.message` defined in `lexicons/is/keith/fc/message.json` — text (255 chars max), video blob (mp4, 10MB max), optional bluesky cross-post URI, optional expiration datetime.

## Conventions

- **ABOUTME headers:** Server-side TS files use 2-line `// ABOUTME:` comments at the top (greppable).
- **No test suite** currently exists.
- **CSS:** Single file at `src/public/css/main.css`. Open Props for design tokens, GT Maru font, Y2K aesthetic (pink `#ff69b4`, teal `#20b2aa`, bold black borders).
- **HTML:** Template literals returned directly from Elysia route handlers. The main page template lives in the `/` GET handler in `src/server/index.ts`.
- **TypeScript:** Strict mode, `jsxImportSource: @elysiajs/html`. `allowJs: true` so frontend JS coexists.

## Environment Variables

- `PORT` — server port (default: 3891)
- `BASE_URL` — public URL for OAuth (auto-detected from headers if not set)
- `STORAGE_ADAPTER` — `sqlite` (default) or `json`
- `DATA_DIR` — path to data directory (default: `data`)

## Gotchas

- OAuth sessions are in-memory only — server restart = everyone logs out
- The DPoP keypair in `oauth-client.ts` is hardcoded (should be dynamic in production)
- Some files in `src/bluesky/` and some route files (`auth.ts`, `chat.ts`, `history.ts`) are older/unused placeholders
- SQLite auto-prunes to 20 messages; the "last 20" limit is fundamental to the design
- Video conversion uses `bun.$` to shell out to ffmpeg
