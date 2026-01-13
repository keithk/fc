// ABOUTME: Shared configuration for friend club
// ABOUTME: Centralizes OAuth scopes, app settings, and URLs

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3891";

// Custom lexicon for friend club messages
export const FC_COLLECTION = "is.keith.fc.message";

// OAuth scopes - all scope definitions live here
export const OAUTH_SCOPES = {
  // Base ATProto access
  base: "atproto",
  // Write to our custom lexicon
  customLexicon: `repo:${FC_COLLECTION}`,
  // Cross-post to Bluesky feed (optional)
  bskyPost: "app.bsky.feed.post",
  // Upload video/image blobs
  videoBlob: "blob:video/*",
  imageBlob: "blob:image/*",
};

// Combined scope string for OAuth requests
export const OAUTH_SCOPE_STRING = Object.values(OAUTH_SCOPES).join(" ");

export const OAUTH_CONFIG = {
  clientId: `${BASE_URL}/oauth-client-metadata.json`,
  redirectUri: `${BASE_URL}/oauth/callback`,
  scopes: OAUTH_SCOPE_STRING,
};

export const APP_CONFIG = {
  port: 3891,
  appName: "keith's friend club",
  appUrl: BASE_URL,
};
