import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, isAppError } from "@/core/errors";
import type { User } from "@/features/auth/domain/types";
import { SESSION_COOKIE } from "@/features/auth/server/cookie";
import { getContainer } from "./runtime";

export interface ErrorBody {
  error: { kind: string; message: string; fields?: Record<string, string[]> };
}

export function errorResponse(e: unknown): NextResponse<ErrorBody> {
  if (isAppError(e)) {
    return NextResponse.json({ error: { kind: e.kind, message: e.message, fields: e.fields } }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: { kind: "internal", message: "Something went wrong" } }, { status: 500 });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF check for custom route handlers. Server Actions get an Origin vs Host comparison from Next.js; route
 * handlers do not (data-security guide), so mutations here repeat it. A request without Origin is not from a
 * browser page, so it carries no ambient cookie risk and is allowed.
 */
export function isCrossSite(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Client address for rate limiting. Only Cloudflare's cf-connecting-ip is trusted: Cloudflare sets it and
 * clients can't spoof it, unlike x-forwarded-for. Outside Cloudflare (local dev) there is no IP limit.
 */
export function clientIp(h: Headers): string | undefined {
  return h.get("cf-connecting-ip") ?? undefined;
}

/**
 * Wraps a route handler: rejects cross-site mutations (403), resolves the session from the request cookie
 * (401 if absent), runs the handler, and maps domain errors to HTTP status codes.
 */
export function withUser<Ctx>(handler: (req: NextRequest, user: User, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      if (isCrossSite(req)) throw new AppError("forbidden", "Cross-site request");
      const user = await getContainer().auth.validate(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user) throw new AppError("unauthorized", "Sign in first");
      return await handler(req, user, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/**
 * Reads a request body into memory, refusing more than `maxBytes`. Content-Length is required and checked up
 * front (411 if missing or invalid, 413 if too big), but it is only a hint: the stream itself is counted and
 * cancelled as soon as it passes the limit, so a client that lies about the length still can't make the server
 * buffer an unbounded body.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const header = req.headers.get("content-length")?.trim() ?? "";
  const declared = /^\d+$/.test(header) ? Number(header) : NaN;
  if (!Number.isSafeInteger(declared) || declared <= 0) {
    throw new AppError("length_required", "A valid Content-Length header is required");
  }
  if (declared > maxBytes) throw new AppError("too_large", "Request body too large");
  if (!req.body) throw new AppError("validation", "Request body is empty");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("too_large", "Request body too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
