import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import { openSqlite } from "@/db/sqlite";
import { createContainer, type Container } from "./container";

type D1Client = Parameters<typeof drizzle>[0];

// One container per server process (per isolate on Workers), so the in-memory rate limiters live as
// long as the process does. Tests swap it with setContainer().
const g = globalThis as unknown as { __teamboard?: Container };

/** Set in wrangler.jsonc. Local dev, tests and E2E use a SQLite file instead. */
const onCloudflare = () => process.env.DB_DRIVER === "d1";

export function getContainer(): Container {
  g.__teamboard ??= onCloudflare()
    ? createContainer(drizzle(getCloudflareContext().env.DB as D1Client, { schema }))
    : createContainer(openSqlite(process.env.DATABASE_PATH ?? "./data/teamboard.db"));
  return g.__teamboard;
}

export function setContainer(container: Container | undefined): void {
  g.__teamboard = container;
}
