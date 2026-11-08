import { NextResponse } from "next/server";
import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

/** The signed-in user's plan, limits and whether billing is configured at all. */
export const GET = withUser<unknown>(async (_req, user) => {
  const status = await getContainer().billing.status(user);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
});
