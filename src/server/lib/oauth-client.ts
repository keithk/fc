// ABOUTME: Bluesky OAuth client setup
// ABOUTME: Uses server-side OAuth to post on behalf of users

import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { OAUTH_SCOPE_STRING_METADATA, APP_CONFIG } from "../../shared/config";

// in-memory stores for oauth state and sessions
const stateStore = new Map();
const sessionStore = new Map();

// cache oauth clients by origin (local/ngrok/production)
const oauthClients = new Map<string, NodeOAuthClient>();

export async function getOAuthClient(origin: string) {
  console.log(`[oauth-client] getOAuthClient called with origin: ${origin}`);
  if (!oauthClients.has(origin)) {
    console.log(`[oauth-client] Creating new OAuth client for: ${origin}`);
    const client = new NodeOAuthClient({
      clientMetadata: {
        client_id: `${origin}/oauth-client-metadata.json`,
        client_name: APP_CONFIG.appName,
        client_uri: origin,
        redirect_uris: [`${origin}/oauth/callback`],
        scope: OAUTH_SCOPE_STRING_METADATA,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "web",
        dpop_bound_access_tokens: true,
      },
      stateStore: {
        get: async (key: string) => stateStore.get(key),
        set: async (key: string, value: any) => {
          stateStore.set(key, value);
        },
        del: async (key: string) => {
          stateStore.delete(key);
        },
      },
      sessionStore: {
        get: async (key: string) => sessionStore.get(key),
        set: async (key: string, value: any) => {
          sessionStore.set(key, value);
        },
        del: async (key: string) => {
          sessionStore.delete(key);
        },
      },
      // static dpop key for signing requests
      // in production, generate this dynamically and store securely
      keyset: [
        {
          kid: "face-chat-key",
          alg: "ES256",
          kty: "EC",
          crv: "P-256",
          x: "SVqiG6LZTh0jJlJkLICLfx-RPqHH4TnT2PaI8JZH6Qc",
          y: "xdMcEFMSJPtgYAQPBfUp5F8TBvJwRmHvuUx-QTBbPRo",
          d: "N-VjbD7IV0a1K3K8TtKQ7kLKkTtt_vCGvqwYp6NPSHY",
        },
      ],
    });
    oauthClients.set(origin, client);
  }
  return oauthClients.get(origin)!;
}

export { sessionStore as userSessionStore };
