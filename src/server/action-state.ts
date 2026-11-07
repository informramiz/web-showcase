import { isAppError } from "@/core/errors";

/** What a form server action returns to `useActionState`. */
export interface ActionState {
  error?: string;
  fields?: Record<string, string[]>;
  ok?: boolean;
}

/** Turns an expected domain error into form state; anything else is a real bug and is rethrown. */
export function toActionState(e: unknown): ActionState {
  if (isAppError(e)) return { error: e.message, fields: e.fields };
  throw e;
}

/**
 * Client address for rate limiting. Only Cloudflare's cf-connecting-ip is trusted: Cloudflare sets it and
 * clients can't spoof it, unlike x-forwarded-for. Outside Cloudflare (local dev) there is no IP limit.
 */
export function clientIp(h: Headers): string | undefined {
  return h.get("cf-connecting-ip") ?? undefined;
}
