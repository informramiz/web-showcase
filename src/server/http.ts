import { NextResponse, type NextRequest } from "next/server";
import { isAppError } from "@/core/errors";
import type { User } from "@/features/auth/domain/types";
import { SESSION_COOKIE } from "@/features/auth/server/cookie-name";
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

/**
 * Wraps a route handler: resolves the session from the request cookie (401 if absent),
 * runs the handler, and maps domain errors to HTTP status codes.
 */
export function withUser<Ctx>(handler: (req: NextRequest, user: User, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const user = await getContainer().auth.validate(req.cookies.get(SESSION_COOKIE)?.value);
      if (!user)
        return NextResponse.json({ error: { kind: "unauthorized", message: "Sign in first" } }, { status: 401 });
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
