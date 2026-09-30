// ABOUTME: atproto OAuth routes: client metadata, JWKS, login, callback, and logout
// ABOUTME: A successful login sets a signed httpOnly cookie holding the user's DID

import { Elysia, t } from "elysia";
import { getOrigin, OAUTH_SCOPE_STRING } from "../../shared/config.ts";
import { getOAuthClient } from "../lib/oauth-client.ts";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../lib/sessions.ts";

// Elysia's redirect() needs an absolute URL on the Node adapter, so build these directly
function redirectTo(location: string, status = 302) {
  return new Response(null, { status, headers: { Location: location } });
}

function loginErrorRedirect(message: string) {
  return redirectTo(`/?login_error=${encodeURIComponent(message)}`);
}

export const oauthRoutes = new Elysia()
  // The OAuth server fetches this to learn who we are
  .get("/oauth-client-metadata.json", async ({ headers }) => {
    const client = await getOAuthClient(getOrigin(headers));
    return Response.json(client.clientMetadata, {
      headers: { "cache-control": "no-cache" },
    });
  })

  // Public half of the key we sign token requests with
  .get("/jwks.json", async ({ headers }) => {
    const client = await getOAuthClient(getOrigin(headers));
    return client.jwks;
  })

  .get(
    "/oauth/login",
    async ({ query, headers, redirect }) => {
      // Bare usernames are assumed to be on bsky.social
      const handle = query.handle.trim().replace(/^@/, "");
      const identifier = handle.includes(".") ? handle : `${handle}.bsky.social`;

      try {
        const client = await getOAuthClient(getOrigin(headers));
        const url = await client.authorize(identifier, {
          scope: OAUTH_SCOPE_STRING,
        });
        return redirect(url.toString());
      } catch (error) {
        console.error(`[oauth] authorize failed for ${identifier}:`, error);
        return loginErrorRedirect(`Couldn't find a Bluesky account for ${identifier}`);
      }
    },
    { query: t.Object({ handle: t.String({ minLength: 1 }) }) },
  )

  .get("/oauth/callback", async ({ request, headers, cookie }) => {
    const origin = getOrigin(headers);
    try {
      const client = await getOAuthClient(origin);
      const params = new URL(request.url).searchParams;
      const { session } = await client.callback(params);

      cookie[SESSION_COOKIE].set({
        value: session.did,
        httpOnly: true,
        secure: origin.startsWith("https://"),
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: "/",
      });

      return redirectTo("/");
    } catch (error) {
      console.error("[oauth] callback failed:", error);
      return loginErrorRedirect("Login didn't finish. Please try again.");
    }
  })

  .post("/oauth/logout", async ({ headers, cookie }) => {
    const did = cookie[SESSION_COOKIE]?.value as string | undefined;
    if (did) {
      try {
        const client = await getOAuthClient(getOrigin(headers));
        await client.revoke(did);
      } catch (error) {
        console.warn(`[oauth] revoke failed for ${did}:`, error);
      }
    }
    cookie[SESSION_COOKIE].remove();
    return redirectTo("/", 303);
  });
