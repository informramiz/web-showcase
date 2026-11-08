import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as collection from "@/app/api/projects/[projectId]/tasks/route";
import * as item from "@/app/api/projects/[projectId]/tasks/[taskId]/route";
import * as commentsRoute from "@/app/api/projects/[projectId]/tasks/[taskId]/comments/route";
import * as uploadRoute from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/route";
import * as fileRoute from "@/app/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/route";
import { SESSION_COOKIE } from "@/features/auth/server/cookie";
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

  it("rejects cross-site mutations even with a valid cookie", async () => {
    const r = new NextRequest(`http://localhost${base()}`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${ownerToken}`, origin: "https://evil.example", host: "localhost" },
      body: JSON.stringify({ title: "Forged" }),
    });
    expect((await collection.POST(r, projectCtx())).status).toBe(403);
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

  it("returns task detail with comments and activity, and accepts comments", async () => {
    const task = await w.c.tasks.create(w.owner, w.projectId, { title: "Detail me" });
    const posted = await commentsRoute.POST(
      req(`${base()}/${task.id}/comments`, memberToken, { method: "POST", body: { body: "Looks good" } }),
      taskCtx(task.id),
    );
    expect(posted.status).toBe(201);

    const detail = await item.GET(req(`${base()}/${task.id}`, memberToken), taskCtx(task.id));
    expect(await detail.json()).toMatchObject({
      task: { id: task.id, title: "Detail me" },
      comments: [{ body: "Looks good", authorName: "Max" }],
      activity: [{ action: "comment.added" }, { action: "task.created" }],
    });
    expect((await item.GET(req(`${base()}/nope`, memberToken), taskCtx("nope"))).status).toBe(404);
  });

  it("uploads, downloads with safe headers and deletes attachments", async () => {
    const task = await w.c.tasks.create(w.owner, w.projectId, { title: "Files" });
    const url = `${base()}/${task.id}/attachments`;
    /** Encodes the body like a browser would and sets Content-Length, unless a header override says otherwise. */
    const upload = async (form: FormData | string, headers: Record<string, string | null> = {}) => {
      const encoded = new Request("http://localhost", { method: "POST", body: form });
      const bytes = new Uint8Array(await encoded.arrayBuffer());
      const h = new Headers({
        cookie: `${SESSION_COOKIE}=${memberToken}`,
        "content-type": encoded.headers.get("content-type") ?? "",
        "content-length": String(bytes.byteLength),
      });
      for (const [k, v] of Object.entries(headers)) {
        if (v === null) h.delete(k);
        else h.set(k, v);
      }
      return uploadRoute.POST(
        // A stream body, so the Request constructor doesn't fill in Content-Length on its own.
        new NextRequest(`http://localhost${url}`, {
          method: "POST",
          headers: h,
          body: new Blob([bytes]).stream(),
          duplex: "half",
        }),
        taskCtx(task.id),
      );
    };
    const form = new FormData();
    form.set("file", new File(["a,b\n1,2"], "data.csv", { type: "text/csv" }));
    const created = await upload(form);
    expect(created.status).toBe(201);
    const a = (await created.json()) as { id: string; name: string };
    expect(a.name).toBe("data.csv");

    expect((await upload(new FormData())).status).toBe(400);
    expect((await upload("not multipart", { "content-type": "text/plain" })).status).toBe(400);
    // Declared too big: refused before reading.
    expect((await upload(form, { "content-length": String(10 * 1024 * 1024) })).status).toBe(413);
    // Missing or invalid Content-Length: refused (it used to fail open as 0).
    expect((await upload(form, { "content-length": null })).status).toBe(411);
    for (const bad of ["abc", "-5", "0", "1.5"]) {
      expect((await upload(form, { "content-length": bad })).status).toBe(411);
    }
    // Lying header: claims 100 bytes, sends 6 MB. The counting stream cuts it off.
    const big = new FormData();
    big.set("file", new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }));
    expect((await upload(big, { "content-length": "100" })).status).toBe(413);

    const fileCtx = (attachmentId: string) => ({
      params: Promise.resolve({ projectId: w.projectId, taskId: task.id, attachmentId }),
    });
    const res = await fileRoute.GET(req(`${url}/${a.id}`, ownerToken), fileCtx(a.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="data.csv"/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("a,b\n1,2");

    const detail = await item.GET(req(`${base()}/${task.id}`, memberToken), taskCtx(task.id));
    expect(await detail.json()).toMatchObject({ attachments: [{ id: a.id, uploaderName: "Max" }] });

    expect(
      (await fileRoute.DELETE(req(`${url}/${a.id}`, memberToken, { method: "DELETE" }), fileCtx(a.id))).status,
    ).toBe(204);
    expect((await fileRoute.GET(req(`${url}/${a.id}`, ownerToken), fileCtx(a.id))).status).toBe(404);
  });
});
