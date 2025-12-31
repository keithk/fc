# 🐻 keith's friend club

a simple video chat app for bluesky using oauth. record a 2-second video, write a message, and share it with friends.

built by [keith kurson](https://keith.is) with:
- [bun](https://bun.sh) - fast javascript runtime
- [elysia](https://elysiajs.com) - fast web framework
- [bluesky oauth](https://atproto.com/specs/oauth) - decentralized auth
- sqlite or json - your choice of storage

## features

- **bluesky oauth login** - users log in with their bluesky account
- **2-second video recording** - capture short video messages
- **real-time chat** - websocket-based updates
- **auto-posting to bluesky** - optionally share messages to your bluesky feed
- **persistent storage** - keeps last 20 messages (sqlite or json file)
- **privacy-focused** - no tracking, minimal data storage

## quick start

### prerequisites

- [bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- [ffmpeg](https://ffmpeg.org) for video conversion (`brew install ffmpeg` on mac)
- a public url (ngrok, cloudflare tunnel, or deployed server)

### installation

```bash
# clone the repo
git clone <your-repo-url>
cd fc

# install dependencies
bun install

# set up the database (if using sqlite)
bun run db:setup

# run in development
bun run dev
```

the app will start at `http://127.0.0.1:3891`

### important: using a public url

bluesky oauth requires a publicly accessible url. you have a few options:

#### option 1: ngrok (easiest for local development)

```bash
# install ngrok
brew install ngrok

# start ngrok
ngrok http 3891

# use the https url ngrok gives you
# example: https://abc123.ngrok.io
```

#### option 2: cloudflare tunnel

```bash
# install cloudflared
brew install cloudflare/cloudflare/cloudflared

# start tunnel
cloudflared tunnel --url http://localhost:3891
```

#### option 3: deploy to production

deploy to any hosting service that supports bun:
- [fly.io](https://fly.io)
- [railway](https://railway.app)
- [render](https://render.com)

## configuration

### storage adapters

by default, the app uses sqlite for storage. you can switch to json files:

```bash
# use json file storage (no database needed)
STORAGE_ADAPTER=json bun run dev

# use sqlite (default)
STORAGE_ADAPTER=sqlite bun run dev
```

### creating your own adapter

want to use redis, postgres, or another storage backend? implement the `StorageAdapter` interface:

```typescript
// src/db/adapters/my-adapter.ts
import type { StorageAdapter, ChatMessage } from './base'

export class MyAdapter implements StorageAdapter {
  saveMessage(message: ChatMessage): void {
    // save and auto-prune to keep last 20
  }

  getRecentMessages(limit = 20): ChatMessage[] {
    // return messages oldest-first
  }

  getAllMessages(): ChatMessage[] {
    // return all messages for export
  }

  getMessageCount(): number {
    // return count
  }
}
```

then update `src/db/messages.ts` to use it:

```typescript
case 'myadapter':
  return new MyAdapter()
```

### environment variables

- `PORT` - server port (default: 3891)
- `BASE_URL` - base url for oauth (usually auto-detected)
- `STORAGE_ADAPTER` - storage backend (sqlite|json)

## customization

### changing the app name

update `src/shared/config.ts`:

```typescript
export const APP_CONFIG = {
  port: 3891,
  appName: 'your club name',
  appUrl: BASE_URL
}
```

### changing the styling

all css is in `src/public/css/main.css`. the design uses:
- gt maru font family
- y2k aesthetic with bold borders
- pink (#ff69b4) and teal (#20b2aa) colors

### adding features

the codebase is organized by feature:
- `src/server/` - server routes and setup
- `src/db/` - storage and database
- `src/public/` - frontend html/css/js
- `src/bluesky/` - bluesky api integration

## deployment

### fly.io

```bash
# install flyctl
brew install flyctl

# login
flyctl auth login

# create app
flyctl launch

# deploy
flyctl deploy
```

### railway

1. connect your github repo
2. select the fc directory
3. set build command: `bun install`
4. set start command: `bun run src/server/index.ts`
5. add ffmpeg buildpack

### render

1. create new web service
2. connect github repo
3. build command: `bun install`
4. start command: `bun run src/server/index.ts`
5. add environment variable: `PORT=10000`

## privacy

the app stores:
- last 20 messages only (auto-deleted)
- user handles and dids
- video data urls (deleted with messages)
- oauth sessions (in-memory, lost on restart)

no analytics, no tracking, no third-party services.

## how it works

### oauth flow

1. user enters bluesky handle
2. server resolves handle to did
3. redirect to bluesky oauth
4. bluesky redirects back with code
5. server exchanges code for access token
6. token stored server-side for posting

### video recording

1. record 2 seconds of webcam video
2. convert to webm/mp4 format
3. encode as data url for storage
4. if posting to bluesky, upload as blob to user's pds

### websocket chat

1. client connects to `/ws`
2. server sends last 20 messages
3. new messages broadcast to all connected clients
4. messages auto-saved and pruned to 20

## troubleshooting

### oauth not working

- make sure you're using a public url (ngrok, cloudflare tunnel, or deployed)
- use `http://127.0.0.1:3891` not `localhost` for local dev
- check the browser console for errors

### videos not converting

- make sure ffmpeg is installed (`ffmpeg -version`)
- check server logs for conversion errors
- videos must be under 16mb

### database errors

if you see "no such column: user_handle":
```bash
# delete old database
rm data/chat.db

# recreate
bun run db:setup
```

## contributing

this is a personal project by keith, but feel free to fork and customize for your own communities!

ideas for improvements:
- rate limiting
- moderation tools
- user profiles
- threads/replies
- reactions
- custom themes

## license

MIT - do whatever you want with it

---

made with love by [keith](https://keith.is) 🐻
