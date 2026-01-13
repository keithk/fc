/**
 * shared configuration
 * note: oauth config is mostly set dynamically from request headers
 * to support local dev, ngrok, and production deployments
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3891";

export const OAUTH_CONFIG = {
  clientId: `${BASE_URL}/oauth-client-metadata.json`,
  redirectUri: `${BASE_URL}/oauth/callback`,
  scopes:
    "atproto repo:is.keith.fc.message app.bsky.feed.post com.atproto.repo.uploadBlob",
};

export const APP_CONFIG = {
  port: 3891,
  appName: "keith's friend club",
  appUrl: BASE_URL,
};
