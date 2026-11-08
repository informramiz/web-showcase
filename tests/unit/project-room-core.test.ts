import { describe, expect, it } from "vitest";
import {
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

describe("ProjectRoomCore", () => {
  it("admits a ticket once and refuses reuse", async () => {
    const room = new ProjectRoomCore(fakeState().state);
    expect(await room.admit({ jti: "a", exp: 2_000 }, 1_000)).toBe(true);
    expect(await room.admit({ jti: "a", exp: 2_000 }, 1_500)).toBe(false);
    expect(await room.admit({ jti: "b", exp: 2_000 }, 1_500)).toBe(true);
  });

  it("prunes used ticket ids once they have expired", async () => {
    const { state, store } = fakeState();
    const room = new ProjectRoomCore(state);
    await room.admit({ jti: "old", exp: 1_000 }, 500);
    await room.admit({ jti: "new", exp: 9_000 }, 2_000);
    expect([...store.keys()]).toEqual(["ticket:new"]);
  });

  it("revokes only the given user's sockets", () => {
    const alice1 = new FakeSocket(["alice"]);
    const alice2 = new FakeSocket(["alice"]);
    const bob = new FakeSocket(["bob"]);
    const room = new ProjectRoomCore(fakeState([alice1, alice2, bob]).state);
    expect(room.tagsFor("alice")).toEqual(["alice"]);
    expect(room.revoke("alice")).toBe(2);
    expect(alice1.closed).toEqual([REVOKED_CLOSE_CODE, "Access revoked"]);
    expect(alice2.closed?.[0]).toBe(REVOKED_CLOSE_CODE);
    expect(bob.closed).toBeNull();
    // Closing an already-closed socket is tolerated.
    expect(room.revoke("alice")).toBe(2);
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
