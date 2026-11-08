import { NextResponse } from "next/server";
import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

/** Returns a Stripe customer portal URL for managing or cancelling the subscription. */
export const POST = withUser<unknown>(async (req, user) => {
  const url = await getContainer().billing.portal(user, req.nextUrl.origin);
  return NextResponse.json({ url });
});
