/**
 * Short-lived, HMAC-signed proof that a user may join a project's realtime room. The Next.js API mints it after
 * the normal session and membership checks; the Worker verifies it before handing the socket to the Durable
 * Object, so the WebSocket path never touches the session store. WebCrypto only, so it runs on Workers and Node.
 */
export interface TicketClaims {
  projectId: string;
  userId: string;
  /** Unique id; the project room admits each ticket once. */
  jti: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

/** Only long enough to open the socket right after the API hands it out. */
export const TICKET_TTL_MS = 30_000;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signTicket(claims: TicketClaims, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The claims if the signature is valid, the ticket is unexpired and it names `projectId`; otherwise null. */
export async function verifyTicket(
  ticket: string,
  secret: string,
  projectId: string,
  now: number = Date.now(),
): Promise<TicketClaims | null> {
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    // crypto.subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as TicketClaims;
    return claims.projectId === projectId && claims.exp > now ? claims : null;
  } catch {
    return null;
  }
}
