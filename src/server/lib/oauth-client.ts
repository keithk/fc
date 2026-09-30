// ABOUTME: Confidential atproto OAuth client with sessions persisted in SQLite
// ABOUTME: Signs token requests with the ES256 key from OAUTH_PRIVATE_KEY

import {
  JoseKey,
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
  type RuntimeLock,
} from "@atproto/oauth-client-node";
import { getDatabase } from "../../db/database.ts";
import { APP_CONFIG, OAUTH_SCOPE_STRING } from "../../shared/config.ts";

// Authorization state only needs to live for the length of one login
const STATE_TTL_MS = 60 * 60 * 1000;

const stateStore = {
  async get(key: string): Promise<NodeSavedState | undefined> {
    const row = getDatabase()
      .prepare("SELECT value FROM oauth_state WHERE key = ? AND created_at > ?")
      .get(key, Date.now() - STATE_TTL_MS) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  },
  async set(key: string, value: NodeSavedState): Promise<void> {
    const db = getDatabase();
    db.prepare("DELETE FROM oauth_state WHERE created_at <= ?").run(
      Date.now() - STATE_TTL_MS,
    );
    db.prepare(
      "INSERT OR REPLACE INTO oauth_state (key, value, created_at) VALUES (?, ?, ?)",
    ).run(key, JSON.stringify(value), Date.now());
  },
  async del(key: string): Promise<void> {
    getDatabase().prepare("DELETE FROM oauth_state WHERE key = ?").run(key);
  },
};

const sessionStore = {
  async get(did: string): Promise<NodeSavedSession | undefined> {
    const row = getDatabase()
      .prepare("SELECT value FROM oauth_session WHERE key = ?")
      .get(did) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  },
  async set(did: string, value: NodeSavedSession): Promise<void> {
    getDatabase()
      .prepare(
        "INSERT OR REPLACE INTO oauth_session (key, value, updated_at) VALUES (?, ?, ?)",
      )
      .run(did, JSON.stringify(value), Date.now());
  },
  async del(did: string): Promise<void> {
    getDatabase().prepare("DELETE FROM oauth_session WHERE key = ?").run(did);
  },
};

// Cheap check for page renders: does this DID still have a stored session?
export function hasStoredSession(did: string): boolean {
  return Boolean(
    getDatabase().prepare("SELECT 1 FROM oauth_session WHERE key = ?").get(did),
  );
}

// One server process, so an in-process lock keeps token refreshes from racing
const locks = new Map<string, Promise<unknown>>();
const requestLock: RuntimeLock = async (key, fn) => {
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(fn);
  locks.set(key, current);
  try {
    return await current;
  } finally {
    if (locks.get(key) === current) locks.delete(key);
  }
};

async function loadKeyset() {
  const privateKey = process.env.OAUTH_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "OAUTH_PRIVATE_KEY is not set. Run `npm run keygen` and add the output to your environment.",
    );
  }
  return [await JoseKey.fromImportable(privateKey)];
}

// Cache one client per origin so local, tunnel, and production URLs all work
const oauthClients = new Map<string, Promise<NodeOAuthClient>>();

export function getOAuthClient(origin: string): Promise<NodeOAuthClient> {
  let client = oauthClients.get(origin);
  if (!client) {
    client = loadKeyset().then(
      (keyset) =>
        new NodeOAuthClient({
          clientMetadata: {
            client_id: `${origin}/oauth-client-metadata.json`,
            client_name: APP_CONFIG.appName,
            client_uri: origin,
            policy_uri: `${origin}/privacy`,
            redirect_uris: [`${origin}/oauth/callback`],
            scope: OAUTH_SCOPE_STRING,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            application_type: "web",
            token_endpoint_auth_method: "private_key_jwt",
            token_endpoint_auth_signing_alg: "ES256",
            dpop_bound_access_tokens: true,
            jwks_uri: `${origin}/jwks.json`,
          },
          keyset,
          stateStore,
          sessionStore,
          requestLock,
        }),
    );
    oauthClients.set(origin, client);
  }
  return client;
}
