import path from "node:path";
import { defineConfig } from "vitest/config";

// Красная команда на РЕАЛЬНОЙ модели: `npm run redteam`. Нужны AI_PROVIDER=amvera и AI_API_KEY в .env.
// Не входит в `npm test` (тратит токены). Идёт на тестовой базе data/test.db, результат пишет в docs/redteam-results.md.
export default defineConfig({
  test: {
    globalSetup: ["tests/global-setup.ts"],
    environment: "node",
    include: ["redteam/**/*.redteam.ts"],
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
