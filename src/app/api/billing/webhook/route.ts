import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/server/http";
import { getContainer } from "@/server/runtime";

/**
 * Stripe webhook. No session or CSRF check: Stripe authenticates with the Stripe-Signature header, verified
 * over the raw body (docs.stripe.com/webhooks#verify-events), so the body is read as text, never parsed first.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    await getContainer().billing.handleWebhook(await req.text(), req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}
