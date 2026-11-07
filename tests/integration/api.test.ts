import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as collection from "@/app/api/projects/[projectId]/tasks/route";
import * as item from "@/app/api/projects/[projectId]/tasks/[taskId]/route";
import { SESSION_COOKIE } from "@/features/auth/server/cookie-name";
import { setContainer } from "@/server/runtime";
import { makeWorld, type World } from "../helpers/setup";

let w: World;
let ownerToken: string;
let memberToken: string;

beforeEach(async () => {
  w = await makeWorld();
  setContainer(w.c);
  ownerToken = (await w.c.auth.login({ email: w.owner.email, password: "password1" })).token;
  memberToken = (await w.c.auth.login({ email: w.member.email, password: "password1" })).token;
});
afterEach(() => setContainer(undefined));

function req(path: string, token: string | null, init: { method?: string; body?: unknown } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

const projectCtx = () => ({ params: Promise.resolve({ projectId: w.projectId }) });
const taskCtx = (taskId: string) => ({ params: Promise.resolve({ projectId: w.projectId, taskId }) });
const base = () => `/api/projects/${w.projectId}/tasks`;

describe("task route handlers", () => {
  it("requires a valid session", async () => {
    expect((await collection.GET(req(base(), null), projectCtx())).status).toBe(401);
    expect((await collection.GET(req(base(), "forged"), projectCtx())).status).toBe(401);
  });

  it("creates, lists with filters, updates and deletes", async () => {
    const created = await collection.POST(
      req(base(), memberToken, { method: "POST", body: { title: "Ship it" } }),
      projectCtx(),
    );
    expect(created.status).toBe(201);
    const task = (await created.json()) as { id: string; status: string };
    expect(task.status).toBe("todo");

    const list = await collection.GET(req(`${base()}?search=ship&pageSize=5`, memberToken), projectCtx());
    expect(await list.json()).toMatchObject({ total: 1, pageSize: 5, items: [{ title: "Ship it" }] });

    const patched = await item.PATCH(
      req(`${base()}/${task.id}`, memberToken, { method: "PATCH", body: { status: "done" } }),
      taskCtx(task.id),
    );
    expect(await patched.json()).toMatchObject({ status: "done" });

    // Members can't delete; owners can.
    expect(
      (await item.DELETE(req(`${base()}/${task.id}`, memberToken, { method: "DELETE" }), taskCtx(task.id))).status,
    ).toBe(403);
    expect(
      (await item.DELETE(req(`${base()}/${task.id}`, ownerToken, { method: "DELETE" }), taskCtx(task.id))).status,
    ).toBe(204);
  });

  it("maps validation and missing resources to 400 and 404", async () => {
    const bad = await collection.POST(req(base(), memberToken, { method: "POST", body: { title: "" } }), projectCtx());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { kind: "validation", fields: { title: ["Enter a title"] } } });

    const notJson = await collection.POST(req(base(), memberToken, { method: "POST", body: "{nope" }), projectCtx());
    expect(notJson.status).toBe(400);

    const missing = await item.PATCH(
      req(`${base()}/nope`, memberToken, { method: "PATCH", body: { title: "x" } }),
      taskCtx("nope"),
    );
    expect(missing.status).toBe(404);
  });

  it("hides projects from non-members", async () => {
    const outsider = (await w.c.auth.login({ email: w.outsider.email, password: "password1" })).token;
    expect((await collection.GET(req(base(), outsider), projectCtx())).status).toBe(404);
  });
});
