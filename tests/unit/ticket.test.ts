import { describe, expect, it } from "vitest";
import { signTicket, TICKET_TTL_MS, verifyTicket } from "@/features/realtime/domain/ticket";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;
const claims = { projectId: "p1", userId: "u1", jti: "j1", iat: NOW, exp: NOW + TICKET_TTL_MS };

describe("realtime tickets", () => {
  it("round-trips valid claims", async () => {
    const ticket = await signTicket(claims, SECRET);
    expect(await verifyTicket(ticket, SECRET, "p1", NOW)).toEqual(claims);
  });

  it("rejects another project, expiry and a wrong secret", async () => {
    const ticket = await signTicket(claims, SECRET);
    expect(await verifyTicket(ticket, SECRET, "p2", NOW)).toBeNull();
    expect(await verifyTicket(ticket, SECRET, "p1", claims.exp)).toBeNull();
    expect(await verifyTicket(ticket, "other-secret", "p1", NOW)).toBeNull();
  });

  it("rejects tampered and malformed tickets", async () => {
    const [, signature] = (await signTicket(claims, SECRET)).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, projectId: "p2" })).toString("base64url");
    expect(await verifyTicket(`${forgedPayload}.${signature!}`, SECRET, "p2", NOW)).toBeNull();
    for (const bad of ["", "abc", "a.b.c", "!!!.???", "a."]) {
      expect(await verifyTicket(bad, SECRET, "p1", NOW)).toBeNull();
    }
  });

  it("defaults to the current time", async () => {
    const ticket = await signTicket({ ...claims, exp: Date.now() + TICKET_TTL_MS }, SECRET);
    expect(await verifyTicket(ticket, SECRET, "p1")).not.toBeNull();
  });
});
