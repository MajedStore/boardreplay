import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("."),
      "server-only": path.resolve("tests/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    testTimeout: 20000,
  },
});
