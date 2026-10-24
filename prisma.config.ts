import "dotenv/config";
import { defineConfig } from "prisma/config";
import path from "node:path";
import fs from "node:fs";
const configuredUrl = process.env.DATABASE_URL || "file:./data/boardreplay.db";
const filename = path.resolve(configuredUrl.replace(/^file:/, ""));
fs.mkdirSync(path.dirname(filename), { recursive: true });
// The Windows schema engine expects the SQLite file to exist before migrate deploy.
if (!fs.existsSync(filename)) fs.closeSync(fs.openSync(filename, "a"));
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: `file:${filename.replaceAll("\\", "/")}` },
});
