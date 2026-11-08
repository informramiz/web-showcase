import { describe, expect, it } from "vitest";
import type { User } from "@/features/auth/domain/types";
import { RealtimeService } from "@/features/realtime/domain/realtime-service";
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

describe("ticket issue time", () => {
  it("is taken before the membership check, so a revocation during the check still covers it", async () => {
    const clock = { t: NOW };
    const service = new RealtimeService({
      // The membership check is slow: the clock moves while it runs.
      projectService: { authorize: () => Promise.resolve(void (clock.t += 1_000)).then(() => "member" as const) },
      transport: { kind: "websocket", secret: SECRET },
      now: () => clock.t,
      newId: () => "j1",
    });
    const conn = await service.connection({ id: "u1" } as User, "p1");
    if (conn.transport !== "websocket") throw new Error("expected websocket");
    const ticket = new URL(conn.url, "http://x").searchParams.get("ticket")!;
    expect(await verifyTicket(ticket, SECRET, "p1", NOW)).toMatchObject({ iat: NOW, exp: NOW + TICKET_TTL_MS });
  });
});
