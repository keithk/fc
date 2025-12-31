import { NodeOAuthClient } from "@atproto/oauth-client-node";

// For development
const CLIENT_ID = "http://localhost:3891/oauth-client-metadata.json";
const REDIRECT_URI = "http://localhost:3891/api/auth/callback";

// Simple in-memory stores for development
const stateStore = new Map<string, any>();
const sessionStore = new Map<string, any>();

export class BlueskyAuth {
  private client: NodeOAuthClient;

  constructor() {
    try {
      this.client = new NodeOAuthClient({
        clientMetadata: CLIENT_ID,
        // Simple state store implementation
        stateStore: {
          set: async (key: string, value: any) => {
            stateStore.set(key, value);
          },
          get: async (key: string) => {
            return stateStore.get(key);
          },
          del: async (key: string) => {
            stateStore.delete(key);
          },
        },
        // Simple session store implementation
        sessionStore: {
          set: async (key: string, value: any) => {
            sessionStore.set(key, value);
          },
          get: async (key: string) => {
            return sessionStore.get(key);
          },
          del: async (key: string) => {
            sessionStore.delete(key);
          },
        },
      });
    } catch (error) {
      console.error("Failed to initialize OAuth client:", error);
      throw error;
    }
  }

  async getAuthorizationUrl(handle: string): Promise<string> {
    try {
      const url = await this.client.authorize(handle, {
        scope: "atproto app.bsky.feed.post com.atproto.repo.uploadBlob",
      });
      return url.toString();
    } catch (error) {
      console.error("Failed to create authorization URL:", error);
      throw error;
    }
  }

  async handleCallback(params: URLSearchParams): Promise<any> {
    try {
      const result = await this.client.callback(params);
      return {
        did: result.sub,
        handle: result.iss,
        session: result,
      };
    } catch (error) {
      console.error("OAuth callback failed:", error);
      throw error;
    }
  }

  async getSession(did: string) {
    try {
      return await this.client.restore(did);
    } catch (error) {
      console.error("Failed to restore session:", error);
      return null;
    }
  }
}
