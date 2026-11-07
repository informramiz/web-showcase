/**
 * Seeds a fresh local database with demo data.
 *
 *   npm run db:seed
 *
 * Demo logins (password for all: demo1234):
 *   demo@teamboard.dev  owner of "Website relaunch", member of "Mobile app v2"
 *   sam@teamboard.dev   owner of "Mobile app v2", member of "Website relaunch"
 */
import { rmSync } from "node:fs";
import { createContainer } from "@/server/container";
import { DEMO_PASSWORD, seedDemo } from "./demo";
import { openSqlite } from "./sqlite";

async function main() {
  const path = process.env.DATABASE_PATH ?? "./data/teamboard.db";
  for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  const n = await seedDemo(createContainer(openSqlite(path)));
  console.log(`Seeded ${path}: ${n} users, 2 projects. Log in as demo@teamboard.dev / ${DEMO_PASSWORD}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
