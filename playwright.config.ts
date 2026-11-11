import { defineConfig } from "@playwright/test";

// Сценарий жюри (раздел 13 ТЗ) на ширине 360 px. Сервер поднимает e2e/serve.mjs на отдельной базе и порту,
// рабочая база и `npm run dev` не затрагиваются.
// По умолчанию помощник работает на заглушке. E2E_REAL_AI=1 берёт настройки модели из .env (нужен AI_API_KEY).
export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 60_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:3200",
    viewport: { width: 360, height: 740 },
    hasTouch: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: "http://localhost:3200/login",
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
