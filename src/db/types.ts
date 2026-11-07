import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/**
 * Any Drizzle SQLite database: better-sqlite3 locally and in tests, Cloudflare D1 in deployment.
 * Repositories only use `await`-ed queries, which both drivers support.
 */
export type Db = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;
