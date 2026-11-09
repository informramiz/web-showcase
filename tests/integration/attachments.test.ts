import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsStorage } from "@/features/attachments/data/fs-storage";
import { createMemoryStorage } from "@/features/attachments/data/memory-storage";
import { createR2Storage, type R2BucketLike } from "@/features/attachments/data/r2-storage";
import { MAX_ATTACHMENT_BYTES } from "@/features/attachments/domain/limits";
import type { AttachmentStorage } from "@/features/attachments/domain/types";
import { makeWorld, type World } from "../helpers/setup";

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const readAll = async (stream: ReadableStream<Uint8Array>) => new Response(stream).text();
const file = (overrides: Partial<{ name: string; contentType: string; data: ArrayBuffer }> = {}) => ({
  name: "notes.txt",
  contentType: "text/plain;charset=utf-8",
  data: bytes("hello"),
  ...overrides,
});

let w: World;
let storage: ReturnType<typeof createMemoryStorage>;
let taskId: string;
beforeEach(async () => {
  storage = createMemoryStorage();
  w = await makeWorld({ storage });
  taskId = (await w.c.tasks.create(w.owner, w.projectId, { title: "Spec" })).id;
});

describe("attachments", () => {
  it("uploads, lists, downloads and logs a file", async () => {
    const a = await w.c.attachments.upload(w.member, w.projectId, taskId, file({ name: "../../etc/notes.txt" }));
    expect(a).toMatchObject({ name: "notes.txt", contentType: "text/plain", size: 5, uploaderName: "Max" });
    expect(a.storageKey).toBe(`${w.projectId}/${a.id}`);
    expect(storage.keys()).toEqual([a.storageKey]);

    const list = await w.c.attachments.list(w.owner, w.projectId, taskId);
    expect(list.map((x) => x.name)).toEqual(["notes.txt"]);

    const { body, attachment } = await w.c.attachments.download(w.owner, w.projectId, taskId, a.id);
    expect(attachment.id).toBe(a.id);
    expect(await readAll(body)).toBe("hello");

    const log = await w.c.activity.listForTask(w.owner, w.projectId, taskId);
    expect(log[0]).toMatchObject({ action: "attachment.added", detail: { name: "notes.txt" } });
  });

  it("enforces size, type, name and task rules", async () => {
    const up = (f: ReturnType<typeof file>, t = taskId) => w.c.attachments.upload(w.member, w.projectId, t, f);
    await expect(up(file({ data: new ArrayBuffer(MAX_ATTACHMENT_BYTES + 1) }))).rejects.toMatchObject({
      kind: "too_large",
    });
    await expect(up(file({ data: new ArrayBuffer(0) }))).rejects.toMatchObject({ kind: "validation" });
    await expect(up(file({ contentType: "text/html" }))).rejects.toMatchObject({ kind: "validation" });
    await expect(up(file({ contentType: "image/svg+xml" }))).rejects.toMatchObject({ kind: "validation" });
    await expect(up(file({ name: "dir/" }))).rejects.toMatchObject({ kind: "validation" });
    await expect(up(file(), "missing")).rejects.toMatchObject({ kind: "not_found" });
    expect(storage.keys()).toEqual([]);
    // Exactly at the limit is fine.
    await expect(up(file({ data: new ArrayBuffer(MAX_ATTACHMENT_BYTES) }))).resolves.toBeDefined();
  });

  it("hides files from outsiders and checks the task", async () => {
    const a = await w.c.attachments.upload(w.member, w.projectId, taskId, file());
    await expect(w.c.attachments.upload(w.outsider, w.projectId, taskId, file())).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(w.c.attachments.download(w.outsider, w.projectId, taskId, a.id)).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(w.c.attachments.list(w.outsider, w.projectId, taskId)).rejects.toMatchObject({ kind: "not_found" });
    await expect(w.c.attachments.download(w.owner, w.projectId, "other-task", a.id)).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("lets the uploader or an owner delete, nobody else", async () => {
    const byOwner = await w.c.attachments.upload(w.owner, w.projectId, taskId, file({ name: "owner.txt" }));
    const byMember = await w.c.attachments.upload(w.member, w.projectId, taskId, file({ name: "member.txt" }));
    await expect(w.c.attachments.delete(w.member, w.projectId, taskId, byOwner.id)).rejects.toMatchObject({
      kind: "forbidden",
    });
    await w.c.attachments.delete(w.member, w.projectId, taskId, byMember.id);
    const second = await w.c.attachments.upload(w.member, w.projectId, taskId, file({ name: "again.txt" }));
    await w.c.attachments.delete(w.owner, w.projectId, taskId, second.id);
    expect(storage.keys()).toEqual([byOwner.storageKey]);
    const log = await w.c.activity.listForTask(w.owner, w.projectId, taskId);
    expect(log[0]).toMatchObject({ action: "attachment.deleted", detail: { name: "again.txt" } });
  });

  it("reports a missing object as not found", async () => {
    const a = await w.c.attachments.upload(w.member, w.projectId, taskId, file());
    await storage.delete(a.storageKey);
    await expect(w.c.attachments.download(w.member, w.projectId, taskId, a.id)).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("attachment failure handling", () => {
  it("removes the object when the row insert fails, and logs failed cleanups", async () => {
    const failing: AttachmentStorage = { ...createMemoryStorage(), delete: () => Promise.reject(new Error("down")) };
    const deleteSpy = vi.spyOn(failing, "delete");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const world = await makeWorld({ storage: failing });
    const t = await world.c.tasks.create(world.owner, world.projectId, { title: "x" });
    const a = await world.c.attachments.upload(world.owner, world.projectId, t.id, file());
    // Deleting still succeeds for the user even though the bucket refused.
    await world.c.attachments.delete(world.owner, world.projectId, t.id, a.id);
    expect(deleteSpy).toHaveBeenCalledWith(a.storageKey);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("rolls back the stored object if the database insert throws", async () => {
    const mem = createMemoryStorage();
    const world = await makeWorld({ storage: mem });
    const t = await world.c.tasks.create(world.owner, world.projectId, { title: "x" });
    // Deleting the task between the existence check and the insert makes the FK fail.
    const original = mem.put.bind(mem);
    mem.put = async (key, data, type) => {
      await original(key, data, type);
      await world.c.tasks.delete(world.owner, world.projectId, t.id);
    };
    await expect(world.c.attachments.upload(world.owner, world.projectId, t.id, file())).rejects.toThrow();
    expect(mem.keys()).toEqual([]);
  });
});

describe("storage adapters", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "teamboard-uploads-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("filesystem: put, get, delete, missing and escaping keys", async () => {
    const fs = createFsStorage(dir);
    await fs.put("p1/a1", bytes("data"), "text/plain");
    expect(await readAll((await fs.get("p1/a1"))!)).toBe("data");
    await fs.delete("p1/a1");
    expect(await fs.get("p1/a1")).toBeNull();
    await fs.delete("p1/a1"); // idempotent
    await expect(fs.put("../escape", bytes("x"), "text/plain")).rejects.toThrow(/Invalid storage key/);
    await expect(fs.get("p1")).rejects.toThrow(); // a directory, not a missing file
  });

  it("R2: maps put/get/delete onto the bucket binding", async () => {
    const objects = new Map<string, { value: ArrayBuffer; contentType?: string }>();
    const bucket: R2BucketLike = {
      put: (key, value, options) => {
        objects.set(key, { value, contentType: options?.httpMetadata?.contentType });
        return Promise.resolve(null);
      },
      get: (key) => {
        const o = objects.get(key);
        return Promise.resolve(o ? { body: new Blob([o.value]).stream() } : null);
      },
      delete: (key) => {
        objects.delete(key);
        return Promise.resolve();
      },
    };
    const r2 = createR2Storage(bucket);
    await r2.put("p/a", bytes("pdf"), "application/pdf");
    expect(objects.get("p/a")?.contentType).toBe("application/pdf");
    expect(await readAll((await r2.get("p/a"))!)).toBe("pdf");
    await r2.delete("p/a");
    expect(await r2.get("p/a")).toBeNull();
  });
});

describe("attachments without object storage", () => {
  it("reports the feature as off and refuses uploads and downloads with 503", async () => {
    const world = await makeWorld({ storage: null });
    const t = await world.c.tasks.create(world.owner, world.projectId, { title: "x" });
    expect(world.c.attachments.enabled).toBe(false);
    expect(await world.c.attachments.list(world.owner, world.projectId, t.id)).toEqual([]);
    await expect(world.c.attachments.upload(world.owner, world.projectId, t.id, file())).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(world.c.attachments.download(world.owner, world.projectId, t.id, "missing")).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("is on when storage is provided", () => {
    expect(w.c.attachments.enabled).toBe(true);
  });
});
