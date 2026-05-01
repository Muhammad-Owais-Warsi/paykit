import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  dialect: "postgresql",
  schema: "../../packages/paykit/src/database/schema.ts",
  dbCredentials: {
    url: process.env.POLAR_DATABASE_URL!,
  },
  migrations: {
    schema: "public",
    table: "paykit_migrations",
  },
});
