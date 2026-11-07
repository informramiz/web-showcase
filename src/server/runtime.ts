import "server-only";
import { openSqlite } from "@/db/sqlite";
import { createContainer, type Container } from "./container";

// One container per server process. Tests swap it with setContainer().
const g = globalThis as unknown as { __teamboard?: Container };

export function getContainer(): Container {
  g.__teamboard ??= createContainer(openSqlite(process.env.DATABASE_PATH ?? "./data/teamboard.db"));
  return g.__teamboard;
}

export function setContainer(container: Container | undefined): void {
  g.__teamboard = container;
}
