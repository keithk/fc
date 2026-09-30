// ABOUTME: keith's friend club server entry point
// ABOUTME: Wires routes, the Jetstream consumer, and the expiration job together

import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { oauthRoutes } from "./routes/oauth.ts";
import { apiRoutes } from "./routes/api.ts";
import { pageRoutes } from "./routes/pages.ts";
import { staticRoutes } from "./routes/static.ts";
import {
  websocketHandler,
  broadcastMessage,
  broadcastDeletion,
} from "./websocket.ts";
import { startJetstream, stopJetstream } from "./lib/jetstream.ts";
import { startCleanupJob, stopCleanupJob } from "./lib/expiration-cleanup.ts";
import { SESSION_COOKIE } from "./lib/sessions.ts";
import { APP_CONFIG } from "../shared/config.ts";
import { messageService } from "../db/messages.ts";

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  throw new Error(
    "COOKIE_SECRET is not set. Run `npm run keygen` and add the output to your environment.",
  );
}

const app = new Elysia({
  adapter: node(),
  cookie: { secrets: cookieSecret, sign: [SESSION_COOKIE] },
})
  // Health check endpoint for container orchestration
  .get("/health", () => ({ status: "ok" }))
  .onError(({ code, error, path, set, status }) => {
    // A cookie signed with an old secret means "logged out", not a broken request.
    // Cookie parsing failed, so clear it with a raw header.
    if (code === "INVALID_COOKIE_SIGNATURE") {
      set.headers["set-cookie"] = `${SESSION_COOKIE}=; Max-Age=0; Path=/`;
      return status(401, { error: "Not logged in" });
    }
    console.error(`[error] ${code} on ${path}:`, error);
  })
  .use(staticRoutes)
  .use(oauthRoutes)
  .use(apiRoutes)
  .use(pageRoutes)
  .ws("/ws", websocketHandler)
  .listen(APP_CONFIG.port);

console.log(
  `🐻 keith's friend club is running at http://127.0.0.1:${APP_CONFIG.port}`,
);
if (process.env.BASE_URL) {
  console.log(`📍 BASE_URL: ${process.env.BASE_URL}`);
}

startJetstream((message, operation) => {
  if (operation === "create") {
    messageService.saveMessage(message);
    broadcastMessage(message);
  } else {
    messageService.deleteMessage(message.id);
    broadcastDeletion(message.id);
  }
});

startCleanupJob();

function shutdown() {
  console.log("\n🛑 Shutting down...");
  stopJetstream();
  stopCleanupJob();
  app.stop();
  messageService.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
