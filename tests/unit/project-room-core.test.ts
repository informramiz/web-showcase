import { describe, expect, it } from "vitest";
import { TICKET_TTL_MS } from "@/features/realtime/domain/ticket";
import {
  REVOCATION_SKEW_MS,
  ProjectRoomCore,
  REVOKED_CLOSE_CODE,
  type RoomSocket,
  type RoomState,
} from "@/features/realtime/data/project-room-core";

class FakeSocket implements RoomSocket {
  sent: string[] = [];
  closed: [number | undefined, string | undefined] | null = null;
  constructor(
    readonly tags: string[],
    private readonly failSend = false,
  ) {}
  send(message: string) {
    if (this.failSend) throw new Error("closing");
    this.sent.push(message);
  }
  close(code?: number, reason?: string) {
    if (this.closed) throw new Error("already closed");
    this.closed = [code, reason];
  }
}

function fakeState(sockets: FakeSocket[] = []) {
  const store = new Map<string, unknown>();
  const state: RoomState<FakeSocket> = {
    getWebSockets: (tag) => (tag ? sockets.filter((s) => s.tags.includes(tag)) : sockets),
    storage: {
      get: <T>(key: string) => Promise.resolve(store.get(key) as T | undefined),
      put: (key, value) => Promise.resolve(void store.set(key, value)),
      list: <T>({ prefix }: { prefix: string }) =>
        Promise.resolve(new Map([...store].filter(([k]) => k.startsWith(prefix))) as Map<string, T>),
      delete: (keys) => Promise.resolve(keys.filter((k) => store.delete(k)).length),
    },
  };
  return { state, store };
}

const ticket = (jti: string, iat: number) => ({ userId: "alice", jti, iat, exp: iat + TICKET_TTL_MS });

describe("ProjectRoomCore", () => {
  it("admits a ticket once and refuses reuse", async () => {
    const room = new ProjectRoomCore(fakeState().state);
    expect(await room.admit(ticket("a", 1_000), 1_000)).toBe(true);
    expect(await room.admit(ticket("a", 1_000), 1_500)).toBe(false);
    expect(await room.admit(ticket("b", 1_000), 1_500)).toBe(true);
  });

  it("refuses a ticket issued before the user was revoked, even if unused", async () => {
    const room = new ProjectRoomCore(fakeState().state);
    const old = ticket("issued-before", 1_000);
    await room.revoke("alice", 1_000);
    expect(await room.admit(old, 1_200)).toBe(false);
    // Bob is unaffected; Alice's tickets issued after the revocation plus skew margin work (if she gets one).
    expect(await room.admit({ ...ticket("bob", 1_000), userId: "bob" }, 1_200)).toBe(true);
    expect(await room.admit(ticket("issued-after", 1_001 + REVOCATION_SKEW_MS), 1_200)).toBe(true);
  });

  it("allows for clock skew: a ticket stamped slightly after the cutoff is still refused", async () => {
    const room = new ProjectRoomCore(fakeState().state);
    await room.revoke("alice", 1_000);
    expect(await room.admit(ticket("skewed", 1_000 + REVOCATION_SKEW_MS), 1_200)).toBe(false);
  });

  it("prunes used ticket ids and revocation cutoffs once they can no longer matter", async () => {
    const { state, store } = fakeState();
    const room = new ProjectRoomCore(state);
    await room.admit(ticket("old", 0), 0);
    await room.revoke("alice", 0);
    const later = TICKET_TTL_MS + REVOCATION_SKEW_MS;
    await room.admit(ticket("new", later), later);
    expect([...store.keys()]).toEqual(["ticket:new"]);
  });

  it("revokes only the given user's sockets", async () => {
    const alice1 = new FakeSocket(["alice"]);
    const alice2 = new FakeSocket(["alice"]);
    const bob = new FakeSocket(["bob"]);
    const room = new ProjectRoomCore(fakeState([alice1, alice2, bob]).state);
    expect(room.tagsFor("alice")).toEqual(["alice"]);
    expect(await room.revoke("alice", 0)).toBe(2);
    expect(alice1.closed).toEqual([REVOKED_CLOSE_CODE, "Access revoked"]);
    expect(alice2.closed?.[0]).toBe(REVOKED_CLOSE_CODE);
    expect(bob.closed).toBeNull();
    // Closing an already-closed socket is tolerated.
    expect(await room.revoke("alice", 1)).toBe(2);
  });

  it("broadcasts to every socket even if one fails", () => {
    const broken = new FakeSocket(["a"], true);
    const ok = new FakeSocket(["b"]);
    const room = new ProjectRoomCore(fakeState([broken, ok]).state);
    room.broadcast({ action: "task.created", taskId: null, actorId: "a", at: "now" });
    expect(ok.sent).toHaveLength(1);
    expect(JSON.parse(ok.sent[0]!)).toMatchObject({ action: "task.created" });
  });
});
