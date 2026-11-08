import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as eventsRoute from "@/app/api/projects/[projectId]/events/route";
import * as realtimeRoute from "@/app/api/projects/[projectId]/realtime/route";
import { SESSION_COOKIE } from "@/features/auth/server/cookie";
import { createDurableObjectEvents } from "@/features/realtime/data/durable-object-events";
import { createMemoryEventBus } from "@/features/realtime/data/memory-event-bus";
import { POLL_INTERVAL_MS } from "@/features/realtime/domain/realtime-service";
import { verifyTicket } from "@/features/realtime/domain/ticket";
import type { ProjectEvent } from "@/features/realtime/domain/types";
import { setContainer } from "@/server/runtime";
import { makeWorld } from "../helpers/setup";

const event = (actorId: string): ProjectEvent => ({ action: "task.created", taskId: "t1", actorId, at: "now" });

describe("memory event bus", () => {
  it("delivers per project and stops after unsubscribe", async () => {
    const bus = createMemoryEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.subscribe("p1", a);
    bus.subscribe("p2", b);
    await bus.publish("p1", event("u"));
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    offA();
    await bus.publish("p1", event("u"));
    await bus.publish("nobody", event("u"));
    expect(a).toHaveBeenCalledOnce();
  });
});

describe("durable object events", () => {
  it("publishes through the project's room stub", async () => {
    const broadcast = vi.fn(() => Promise.resolve());
    const getByName = vi.fn(() => ({ broadcast }));
    await createDurableObjectEvents({ getByName }).publish("p1", event("u"));
    expect(getByName).toHaveBeenCalledWith("p1");
    expect(broadcast).toHaveBeenCalledWith(event("u"));
  });
});

describe("RealtimeService", () => {
  it("polls by default and hides projects from outsiders", async () => {
    const w = await makeWorld();
    expect(await w.c.realtime.connection(w.member, w.projectId)).toEqual({
      transport: "poll",
      intervalMs: POLL_INTERVAL_MS,
    });
    await expect(w.c.realtime.connection(w.outsider, w.projectId)).rejects.toMatchObject({ kind: "not_found" });
    await expect(w.c.realtime.subscribe(w.member, w.projectId, () => undefined)).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("mints a ticket for this user and project over WebSockets", async () => {
    const w = await makeWorld({ transport: { kind: "websocket", secret: "s3cret" } });
    const conn = await w.c.realtime.connection(w.member, w.projectId);
    if (conn.transport !== "websocket") throw new Error("expected websocket");
    const url = new URL(conn.url, "http://localhost");
    expect(url.pathname).toBe(`/realtime/${w.projectId}`);
    const claims = await verifyTicket(url.searchParams.get("ticket")!, "s3cret", w.projectId);
    expect(claims).toMatchObject({ projectId: w.projectId, userId: w.member.id });
  });

  it("streams recorded activity to SSE subscribers", async () => {
    const bus = createMemoryEventBus();
    const w = await makeWorld({ events: bus, transport: { kind: "sse", bus } });
    expect(await w.c.realtime.connection(w.member, w.projectId)).toEqual({
      transport: "sse",
      url: `/api/projects/${w.projectId}/events`,
    });
    const seen: ProjectEvent[] = [];
    const off = await w.c.realtime.subscribe(w.member, w.projectId, (e) => seen.push(e));
    const task = await w.c.tasks.create(w.owner, w.projectId, { title: "Live" });
    off();
    expect(seen).toEqual([expect.objectContaining({ action: "task.created", taskId: task.id, actorId: w.owner.id })]);
  });
});

describe("realtime routes", () => {
  afterEach(() => setContainer(undefined));

  const login = async (w: Awaited<ReturnType<typeof makeWorld>>) =>
    (await w.c.auth.login({ email: w.member.email, password: "password1" })).token;
  const get = (path: string, token: string, signal?: AbortSignal) =>
    new NextRequest(`http://localhost${path}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` }, signal });

  it("returns the connection descriptor uncached", async () => {
    const w = await makeWorld();
    setContainer(w.c);
    const ctx = { params: Promise.resolve({ projectId: w.projectId }) };
    const res = await realtimeRoute.GET(get(`/api/projects/${w.projectId}/realtime`, await login(w)), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ transport: "poll" });
  });

  it("streams events as SSE until the client disconnects", async () => {
    const bus = createMemoryEventBus();
    const w = await makeWorld({ events: bus, transport: { kind: "sse", bus } });
    setContainer(w.c);
    const abort = new AbortController();
    const ctx = { params: Promise.resolve({ projectId: w.projectId }) };
    const res = await eventsRoute.GET(get(`/api/projects/${w.projectId}/events`, await login(w), abort.signal), ctx);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    expect((await reader.read()).value).toBe(": connected\n\n");

    await w.c.tasks.create(w.owner, w.projectId, { title: "Pushed" });
    const chunk = (await reader.read()).value!;
    expect(chunk.startsWith("data: ")).toBe(true);
    expect(JSON.parse(chunk.slice(6))).toMatchObject({ action: "task.created", actorId: w.owner.id });

    abort.abort();
    expect((await reader.read()).done).toBe(true);
  });

  it("refuses the stream when SSE is not the transport", async () => {
    const w = await makeWorld();
    setContainer(w.c);
    const ctx = { params: Promise.resolve({ projectId: w.projectId }) };
    const res = await eventsRoute.GET(get(`/api/projects/${w.projectId}/events`, await login(w)), ctx);
    expect(res.status).toBe(404);
  });
});
