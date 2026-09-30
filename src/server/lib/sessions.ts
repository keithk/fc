// ABOUTME: Maps the signed browser cookie to a restored atproto OAuth session
// ABOUTME: The cookie holds only the user's DID; tokens stay server-side in SQLite

import type { OAuthSession } from "@atproto/oauth-client-node";
import { getOAuthClient } from "./oauth-client.ts";

export const SESSION_COOKIE = "fc_session";
export const SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export async function restoreSession(
  origin: string,
  did: string | undefined,
): Promise<OAuthSession | null> {
  if (!did) return null;
  try {
    const client = await getOAuthClient(origin);
    return await client.restore(did);
  } catch (error) {
    console.warn(`[sessions] Could not restore session for ${did}:`, error);
    return null;
  }
}
