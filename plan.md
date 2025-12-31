# Face Chat - Project Plan

## Overview
An ephemeral chat interface with webcam GIF creation and Bluesky integration. Users can create 5-second GIFs from their webcam, add text (max 255 chars), and optionally share to Bluesky.

## Core Features
1. **Webcam GIF Creation**: 5-second video capture → GIF conversion
2. **Ephemeral Chat**: Last 20 messages visible, lost on refresh
3. **Rate Limiting**: One message per minute per user
4. **Bluesky Integration**:
   - OAuth authentication
   - Optional post to Bluesky feed
   - Personal history stored in AT Protocol PDS
   - Custom lexicon for face chat data

## Tech Stack & Libraries (FINALIZED)

### Core
- **Runtime**: Bun (server, websockets, file system, SQLite)
- **Framework**: Elysia (Bun-native, TypeScript-first, fast)
- **Template Engine**: HTML templates with Elysia's static plugin

### Frontend
- **Video/GIF**:
  - MediaRecorder API for webcam capture
  - gif.js for client-side GIF encoding
- **Real-time**: WebSockets via Elysia
- **Styling**: Open Props CSS library + custom styles
- **Font**: Inter variable font

### Bluesky/AT Protocol
- **@atproto/api**: Official SDK for Bluesky
- **@atproto/oauth-client**: OAuth flow
- **@atproto/lexicon**: Custom lexicon definitions
- **@atproto/repo**: Repository operations

### Data Storage
- **SQLite**: Local message cache & rate limiting
- **Bluesky PDS**: Permanent user history
- **File System**: Temporary GIF storage

## Architecture

### Directory Structure
```
sites/fc/
├── src/
│   ├── server/
│   │   ├── index.ts         # Main server entry
│   │   ├── websocket.ts     # WS handler
│   │   └── routes/
│   │       ├── auth.ts      # OAuth routes
│   │       ├── chat.ts      # Chat API
│   │       └── history.ts   # User history
│   ├── bluesky/
│   │   ├── client.ts        # AT Protocol client
│   │   ├── lexicon/         # Custom schemas
│   │   └── auth.ts          # OAuth handler
│   ├── db/
│   │   ├── schema.sql       # SQLite schema
│   │   └── queries.ts       # DB operations
│   ├── templates/
│   │   ├── index.html       # Main chat view
│   │   └── history.html     # User history
│   └── public/
│       ├── css/
│       └── js/
│           ├── capture.js   # Webcam/GIF logic
│           └── chat.js      # Chat client
├── bun.lockb
└── package.json
```

## Implementation Phases

### Phase 1: Core Chat
- Basic Bun server setup
- Webcam capture → GIF conversion
- WebSocket message broadcasting
- SQLite for ephemeral storage
- Rate limiting (1 msg/min)

### Phase 2: Bluesky Auth
- OAuth client setup
- Session management
- User profile display

### Phase 3: AT Protocol Integration
- Custom lexicon design for face chats
- Store chats in user's PDS
- Implement delete functionality
- History page with user's chats

### Phase 4: Bluesky Posting
- "Share to Bluesky" option
- Upload GIF as blob
- Create post with embed

## Custom Lexicon Design

```typescript
// com.facechat.message
{
  lexicon: 1,
  id: "com.facechat.message",
  defs: {
    main: {
      type: "record",
      record: {
        type: "object",
        properties: {
          text: { type: "string", maxLength: 255 },
          gif: { type: "blob", accept: ["image/gif"] },
          createdAt: { type: "string", format: "datetime" }
        }
      }
    }
  }
}
```

## Key Decisions (FINALIZED)

### 1. Web Framework
**Choice:** Elysia - Bun-native, TypeScript-first, excellent DX

### 2. GIF Creation Strategy
**Choice:** Client-side with gif.js - Lower server load, instant feedback

### 3. Data Flow
**Choice:** REST + WebSockets - REST for posting (rate limit control), WS for broadcasts

### 4. Session Storage
**Choice:** SQLite sessions with secure cookies - Server-side, secure

### 5. CSS & Styling
**Choice:** Open Props for design tokens + Inter font for clean typography

## Security Considerations
- Rate limiting per IP and per user
- GIF size limits (max 5MB)
- Content moderation (text length, profanity filter?)
- CORS configuration for Bluesky OAuth
- Secure session management
- XSS prevention in chat messages

## Development Workflow
1. Set up basic Bun server with chosen framework
2. Implement webcam capture UI
3. Add GIF conversion and preview
4. Set up WebSocket broadcasting
5. Add SQLite for messages and rate limiting
6. Integrate Bluesky OAuth
7. Design and implement custom lexicon
8. Add PDS storage functionality
9. Implement Bluesky posting
10. Polish UI with Y2K aesthetic

## Questions to Resolve
1. Should we use Elysia or stick with Hapi.js?
2. Client-side vs server-side GIF encoding?
3. How to handle GIF storage (temporary vs permanent)?
4. Should chat history be queryable or just sequential?
5. Do we want any moderation features?