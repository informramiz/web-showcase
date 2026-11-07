/**
 * Prints SQL that resets a database to the demo data, for D1 (which a Node script can't open directly).
 * It seeds an in-memory SQLite database through the services, then dumps the rows.
 *
 *   npm run db:seed:remote
 */
import type Database from "better-sqlite3";
import { createContainer } from "@/server/container";
import { seedDemo } from "./demo";
import { openSqlite } from "./sqlite";

// Parents last for deletes, first for inserts. Sessions are cleared, not copied.
const TABLES = ["users", "projects", "project_members", "tasks"] as const;

const literal = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  throw new Error(`Unexpected column value: ${typeof v}`);
};

async function main() {
  const db = openSqlite(":memory:");
  await seedDemo(createContainer(db));
  const sqlite = (db as unknown as { $client: Database.Database }).$client;

  const out = ["DELETE FROM sessions;", ...[...TABLES].reverse().map((t) => `DELETE FROM ${t};`)];
  for (const table of TABLES) {
    for (const row of sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]) {
      const cols = Object.keys(row);
      out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => literal(row[c])).join(", ")});`);
    }
  }
  process.stdout.write(out.join("\n") + "\n");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
