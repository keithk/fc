# 🐻 keith's friend club

a tiny video chat on the AT Protocol. log in with bluesky, record a 2-second video, write a message, and share it. messages live on your own PDS; this server only caches the last 20.

built by [keith kurson](https://keith.is) with:
- [node](https://nodejs.org) 24+ (runs the typescript directly, no build step)
- [elysia](https://elysiajs.com) on its node adapter
- [@atproto/lex](https://atproto.com/blog/ts-sdk-upgrades) for typed records and xrpc
- [@atproto/oauth-client-node](https://atproto.com/specs/oauth) as a confidential oauth client
- [jetstream](https://bsky.network/docs/jetstream/) v2 for the live feed
- plain custom elements on the frontend

## quick start

### prerequisites

- node 24 or newer
- [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg`), which also provides `ffprobe`
- a public https url (ngrok, a cloudflare tunnel, or a deployed server). atproto oauth won't accept `http://` or IP-address client ids

### setup

```bash
bun install            # or npm install

# generate the oauth signing key and cookie secret, then paste both into .env
npm run keygen

# point BASE_URL at your public url
echo "BASE_URL=https://your-tunnel.example.com" >> .env

npm run dev
```

the server listens on port 3891. start your tunnel against that port and open the https url.

### environment variables

- `OAUTH_PRIVATE_KEY` (required): ES256 private JWK from `npm run keygen`. signs token requests; the public half is served at `/jwks.json`
- `COOKIE_SECRET` (required): signs the session cookie. changing it logs everyone out, which is harmless
- `BASE_URL`: public https origin. auto-detected from request headers when unset, but set it in production
- `PORT`: default 3891
- `DATA_DIR`: where `chat.db` lives, default `data`
- `STORAGE_ADAPTER`: `sqlite` (default) or `json` for the message cache. oauth sessions always use sqlite

## how it works

### data flow

1. `POST /api/message` converts the clip to mp4, uploads it as a blob, and creates an `is.keith.fc.message` record on the user's PDS (plus an `app.bsky.feed.post` if they cross-post)
2. jetstream sees the new record and sends it back to the server
3. the server validates it against the lexicon, caches it, and broadcasts it over `/ws`

deletes work the same way. the jetstream cursor is saved in sqlite, so a restart picks up where it left off.

### login

- oauth sessions (tokens + DPoP keys) are stored in sqlite and last up to 180 days
- the browser gets a signed, httpOnly `fc_session` cookie holding only the user's DID
- the expiration job restores a user's session by DID, so expiring messages get deleted even when the author is offline
- `POST /oauth/logout` revokes the session and clears the cookie

requested scopes: `atproto repo:is.keith.fc.message repo:app.bsky.feed.post?action=create&action=delete blob:video/mp4`

### lexicons

`lexicons/` holds our schema (`is/keith/fc/message.json`) plus the bluesky schemas we use, installed with the `lex` cli and pinned in `lexicons.json`. `src/lexicons/` is generated from them and committed, so there's no build step at deploy.

```bash
npm run lexicons:build    # regenerate src/lexicons after editing a schema
npm run lexicons:update   # re-fetch the bluesky schemas, then regenerate
```

### publishing the lexicon

so other atproto tools can resolve `is.keith.fc.message`:

1. add a DNS TXT record at `_lexicon.fc.keith.is` with the value `did=did:plc:t3ehyucfy7ofylu4spnivvmb` (the DID for @keith.is)
2. `goat lex check-dns lexicons/is/keith/fc/message.json` to confirm it resolves
3. `goat lex publish --username keith.is lexicons/is/keith/fc/message.json` (use an app password)

## deployment

railway builds with railpack (`railpack.json` pins node 24 and installs ffmpeg). set `BASE_URL`, `OAUTH_PRIVATE_KEY`, and `COOKIE_SECRET`, and put `DATA_DIR` on a persistent volume so sessions and the jetstream cursor survive deploys.

## privacy

see `/privacy` on the running site. short version: messages live on your PDS, the server caches the last 20 plus anything waiting to expire, and it keeps your oauth session so it can delete expiring messages for you.

## license

MIT - do whatever you want with it

---

made with love by [keith](https://keith.is) 🐻
