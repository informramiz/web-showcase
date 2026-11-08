// Bindings from wrangler.jsonc. Typed loosely to avoid pulling @cloudflare/workers-types into the Node globals.
interface CloudflareEnv {
  DB: unknown;
  ATTACHMENTS: unknown;
  PROJECT_ROOM: unknown;
  /** Secret (wrangler secret put). Signs WebSocket tickets; absent means polling. */
  REALTIME_SECRET?: string;
}
