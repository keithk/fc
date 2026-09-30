// ABOUTME: Shared configuration for friend club
// ABOUTME: Centralizes OAuth scopes, app settings, and URLs

// Custom lexicon for friend club messages
export const FC_COLLECTION = "is.keith.fc.message";

// OAuth permissions requested from the user's PDS
export const OAUTH_SCOPES = {
  // Base ATProto access
  base: "atproto",
  // Write to our custom lexicon (all actions)
  customLexicon: `repo:${FC_COLLECTION}`,
  // Cross-post to Bluesky and delete those cross-posts
  bskyPost: "repo:app.bsky.feed.post?action=create&action=delete",
  // Upload the converted video
  videoBlob: "blob:video/mp4",
};

export const OAUTH_SCOPE_STRING = Object.values(OAUTH_SCOPES).join(" ");

export const APP_CONFIG = {
  port: Number(process.env.PORT) || 3891,
  appName: "keith's friend club",
  dataDir: process.env.DATA_DIR || "data",
};

// Get the public origin, preferring BASE_URL and falling back to request headers
export function getOrigin(headers: Record<string, string | undefined>): string {
  const baseUrl = process.env.BASE_URL;
  if (
    baseUrl &&
    !baseUrl.includes("localhost") &&
    !baseUrl.includes("127.0.0.1")
  ) {
    return baseUrl.replace(/\/$/, "");
  }

  const host = headers["host"] || `127.0.0.1:${APP_CONFIG.port}`;
  const protocol =
    headers["x-forwarded-proto"] ||
    (host.includes("ngrok") || host.includes("keith.is") ? "https" : "http");
  return `${protocol}://${host}`;
}
