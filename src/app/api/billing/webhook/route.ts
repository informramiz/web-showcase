import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/core/errors";
import { errorResponse, readBodyLimited } from "@/server/http";
import { getContainer } from "@/server/runtime";

/** Stripe event payloads are a few KB; anything far larger is not from Stripe and is refused unread. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

/** Stripe-Signature shape: `t=<unix seconds>,v1=<hex>[,...]` (docs.stripe.com/webhooks#verify-manually). */
const SIGNATURE_HEADER = /^t=\d+(,[a-z0-9]+=[A-Za-z0-9]+)*,v1=[0-9a-f]+(,[a-z0-9]+=[A-Za-z0-9]+)*$/;

/**
 * Stripe webhook. No session or CSRF check: Stripe authenticates with the Stripe-Signature header, verified
 * over the raw body (docs.stripe.com/webhooks#verify-events), so the body is read as bytes, never parsed first.
 * A missing or malformed header is refused before the body is read at all.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const signature = req.headers.get("stripe-signature")?.trim() ?? "";
    if (!SIGNATURE_HEADER.test(signature)) throw new AppError("validation", "Missing or malformed Stripe-Signature");
    const body = new TextDecoder().decode(await readBodyLimited(req, MAX_WEBHOOK_BYTES));
    await getContainer().billing.handleWebhook(body, signature);
    return NextResponse.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}
