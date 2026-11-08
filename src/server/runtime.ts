import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { openSqlite } from "@/db/sqlite";
import { createFsStorage } from "@/features/attachments/data/fs-storage";
import { createR2Storage, type R2BucketLike } from "@/features/attachments/data/r2-storage";
import { createDurableObjectEvents, type ProjectRoomNamespace } from "@/features/realtime/data/durable-object-events";
import { createMemoryEventBus } from "@/features/realtime/data/memory-event-bus";
import { createContainer, type Container } from "./container";

type D1Client = Parameters<typeof drizzle>[0];

// One container per server process (per isolate on Workers), so the in-memory rate limiters live as
// long as the process does. Tests swap it with setContainer().
const g = globalThis as unknown as { __teamboard?: Container };

/** Set in wrangler.jsonc. Local dev, tests and E2E use a SQLite file instead. */
const onCloudflare = () => process.env.DB_DRIVER === "d1";

/**
 * Workers: D1, R2, and a Durable Object per project for WebSockets. Without REALTIME_SECRET there is no way to
 * sign socket tickets, so clients fall back to polling.
 */
function cloudflareContainer(): Container {
  const { env } = getCloudflareContext();
  const secret = env.REALTIME_SECRET;
  return createContainer(drizzle(env.DB as D1Client, { schema }), {
    storage: createR2Storage(env.ATTACHMENTS as R2BucketLike),
    ...(secret
      ? {
          events: createDurableObjectEvents(env.PROJECT_ROOM as ProjectRoomNamespace),
          transport: { kind: "websocket", secret },
        }
      : { transport: { kind: "poll" } }),
  });
}

/** Local dev and E2E: one Node process, so an in-memory bus and Server-Sent Events are enough. */
function localContainer(): Container {
  const bus = createMemoryEventBus();
  return createContainer(openSqlite(process.env.DATABASE_PATH ?? "./data/teamboard.db"), {
    storage: createFsStorage(process.env.UPLOADS_DIR ?? "./data/uploads"),
    events: bus,
    transport: process.env.REALTIME_TRANSPORT === "poll" ? { kind: "poll" } : { kind: "sse", bus },
  });
}

export function getContainer(): Container {
  g.__teamboard ??= onCloudflare() ? cloudflareContainer() : localContainer();
  return g.__teamboard;
}

export function setContainer(container: Container | undefined): void {
  g.__teamboard = container;
}
