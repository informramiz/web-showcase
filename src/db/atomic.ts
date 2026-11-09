import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "./types";

/** A built, not yet awaited Drizzle write (`db.insert(...).values(...)`, `db.update(...)`, `db.delete(...)`). */
export type Statement = BatchItem<"sqlite">;

/**
 * Runs several writes so that they all succeed or none does.
 * - D1: `db.batch([...])`. D1 executes a batch as one implicit SQL transaction and rolls the whole sequence
 *   back if a statement fails. Interactive transactions (`BEGIN`/`db.transaction`) are not supported on D1.
 * - better-sqlite3 (local dev, tests, E2E): one synchronous `db.transaction`.
 */
export async function atomically(db: Db, statements: [Statement, ...Statement[]]): Promise<void> {
  const d1 = db as unknown as { batch?: (s: Statement[]) => Promise<unknown> };
  if (typeof d1.batch === "function") {
    await d1.batch(statements);
    return;
  }
  (db as unknown as { transaction: (fn: () => void) => void }).transaction(() => {
    for (const s of statements) (s as unknown as { run(): unknown }).run();
  });
}
