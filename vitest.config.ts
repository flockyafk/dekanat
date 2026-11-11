import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/global-setup.ts"],
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // Обычные тесты не зависят от .env и никогда не ходят к реальной модели (не тратят токены):
    // помощник на заглушке, ключ пустой. Prisma подхватывает .env, но не перезаписывает уже заданное.
    env: {
      AI_PROVIDER: "stub",
      AI_API_KEY: "",
      AI_MODEL: "",
      AI_BASE_URL: "",
      AI_TIMEOUT_MS: "",
      AI_TOTAL_DAILY_LIMIT: "",
      AI_DAILY_LIMIT: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // В тестах пакет server-only не нужен
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
