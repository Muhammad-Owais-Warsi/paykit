import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["paykit-source"],
    },
  },
  test: {
    environment: "node",
    exclude: ["**/dist/**", "**/node_modules/**", "apps/**", "e2e/**"],
    include: ["packages/**/__tests__/**/*.test.ts"],
  },
});
