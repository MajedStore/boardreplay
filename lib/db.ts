import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
const url = process.env.DATABASE_URL || "file:./data/boardreplay.db";
if (!url.startsWith("file:"))
  throw new Error("BoardReplay requires a local SQLite file URL.");
const filename = path.resolve(url.slice(5));
fs.mkdirSync(path.dirname(filename), { recursive: true });
const globalDb = globalThis as unknown as { boardReplayDb?: PrismaClient };
export const db =
  globalDb.boardReplayDb ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${filename}` }),
  });
if (process.env.NODE_ENV !== "production") globalDb.boardReplayDb = db;
