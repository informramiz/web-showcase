// Bindings from wrangler.jsonc. Typed loosely to avoid pulling @cloudflare/workers-types into the Node globals.
interface CloudflareEnv {
  DB: unknown;
  ATTACHMENTS: unknown;
}
