// ABOUTME: DID and handle resolution for any atproto identity (did:plc and did:web)
// ABOUTME: Caches DID documents in memory and verifies handles both ways

import { IdResolver, MemoryCache } from "@atproto/identity";

const resolver = new IdResolver({ didCache: new MemoryCache() });

export interface Identity {
  did: string;
  // undefined when the handle doesn't resolve back to this DID
  handle?: string;
  pds: string;
}

export async function resolveIdentity(did: string): Promise<Identity | null> {
  try {
    const data = await resolver.did.resolveAtprotoData(did);
    const handleDid = await resolver.handle.resolve(data.handle);
    return {
      did,
      handle: handleDid === did ? data.handle : undefined,
      pds: data.pds,
    };
  } catch (error) {
    console.error(`[identity] Failed to resolve ${did}:`, error);
    return null;
  }
}

export function blobUrl(pds: string, did: string, cid: string): string {
  const url = new URL("/xrpc/com.atproto.sync.getBlob", pds);
  url.searchParams.set("did", did);
  url.searchParams.set("cid", cid);
  return url.toString();
}
