// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them. Merged into the generated Env.
interface Env {
  /** Signs WebSocket tickets (wrangler secret put REALTIME_SECRET). Absent means clients poll instead. */
  REALTIME_SECRET?: string;
}
