// ABOUTME: Serves files from src/public under /public with correct MIME types
// ABOUTME: @elysiajs/static sends no Content-Type on Node, which breaks ES modules

import { Elysia } from "elysia";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const PUBLIC_DIR = resolve("src/public");

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export const staticRoutes = new Elysia().get(
  "/public/*",
  async ({ params, status }) => {
    const path = resolve(PUBLIC_DIR, params["*"]);
    const type = MIME_TYPES[extname(path)];
    if (!path.startsWith(PUBLIC_DIR + sep) || !type) {
      return status(404, "Not found");
    }

    try {
      return new Response(await readFile(path), {
        headers: {
          "content-type": type,
          // Asset URLs carry a ?v= version, so they can be cached for a long time
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return status(404, "Not found");
    }
  },
);
