import { NextResponse } from "next/server";
import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

/** Starts a Stripe Checkout session for Pro and returns its URL; the browser redirects there. */
export const POST = withUser<unknown>(async (req, user) => {
  const url = await getContainer().billing.checkout(user, req.nextUrl.origin);
  return NextResponse.json({ url });
});
