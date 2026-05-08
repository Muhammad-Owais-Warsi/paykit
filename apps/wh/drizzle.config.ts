import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";

const d1StateDir = path.resolve(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function resolveLocalSqliteFile(): string {
  const files = fs
    .readdirSync(d1StateDir)
    .filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite")
    .toSorted();

  const file = files[0];
  if (!file) {
    throw new Error(
      "No local D1 SQLite database found. Run `bun --filter wh db:migrate:local` first.",
    );
  }

  return path.join(d1StateDir, file);
}

export default defineConfig({
  dialect: "sqlite",
  out: "./migrations",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: resolveLocalSqliteFile(),
  },
});
