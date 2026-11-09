// Bindings from wrangler.jsonc. Typed loosely to avoid pulling @cloudflare/workers-types into the Node globals.
interface CloudflareEnv {
  DB: unknown;
  /** R2 bucket. Optional: the binding is commented out in wrangler.jsonc until R2 is enabled; attachments are off without it. */
  ATTACHMENTS?: unknown;
  PROJECT_ROOM: unknown;
  /** Secret (wrangler secret put). Signs WebSocket tickets; absent means polling. */
  REALTIME_SECRET?: string;
  /** Secrets. Stripe test-mode keys; billing is hidden unless all three are set. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
}
