import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/dist/**", "**/node_modules/**", "apps/**", "e2e/**", "landing/**"],
    include: ["packages/**/__tests__/**/*.test.ts"],
  },
});
