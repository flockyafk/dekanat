import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globalSetup: ["tests/global-setup.ts"], environment: "node", include: ["tests/**/*.test.ts"], fileParallelism: false },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // В тестах пакет server-only не нужен
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});

