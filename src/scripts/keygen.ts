// ABOUTME: Generates the OAuth client's ES256 private key and the cookie signing secret
// ABOUTME: Prints env lines to paste into .env or the host's secrets

import { randomBytes } from "node:crypto";
import { JoseKey } from "@atproto/jwk-jose";

const kid = `fc-${new Date().toISOString().slice(0, 10)}`;
const key = await JoseKey.generate(["ES256"], kid);

console.log(`OAUTH_PRIVATE_KEY='${JSON.stringify(key.privateJwk)}'`);
console.log(`COOKIE_SECRET='${randomBytes(32).toString("base64url")}'`);
