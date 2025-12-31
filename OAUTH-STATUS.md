# OAuth Implementation Status

## Current Situation

Bluesky's OAuth implementation has several constraints:

1. **BrowserOAuthClient** - Only works with localhost/loopback addresses (127.0.0.1), not public URLs
2. **NodeOAuthClient** - Requires complex server-side setup with proper key management and token exchange
3. **Public OAuth** - Bluesky doesn't yet fully support public OAuth clients with dynamic redirect URIs

## The Challenge

- We need OAuth to work with public URLs (ngrok, face.keith.is)
- Bluesky's OAuth server can't access localhost metadata files
- The current OAuth libraries are designed for either localhost development or full server deployments

## Temporary Solution Options

1. **App Passwords** (simplest) - Users create app passwords on Bluesky
2. **Proxy OAuth** - Create a proxy service that handles OAuth centrally
3. **Wait for Public OAuth** - Bluesky is working on proper public OAuth support

## Recommendation

For now, we should either:
1. Use app passwords for authentication (simple, works everywhere)
2. Deploy a proper OAuth proxy service that can handle the OAuth dance
3. Wait for Bluesky to release proper public OAuth client support

The current implementation attempts to use NodeOAuthClient but requires more configuration than is practical for a simple demo app.