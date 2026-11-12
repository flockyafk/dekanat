import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

// Служебный адрес /e2e-error нужен только для проверки состояния ошибки в e2e. На боевом сайте он обязан отвечать 404.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const saved = process.env.E2E_FORCE_ERROR_ROUTE;
afterEach(() => {
  if (saved === undefined) delete process.env.E2E_FORCE_ERROR_ROUTE;
  else process.env.E2E_FORCE_ERROR_ROUTE = saved;
});

describe("служебный адрес /e2e-error", () => {
  it("без переменной окружения отвечает 404 (так на боевом сайте)", async () => {
    delete process.env.E2E_FORCE_ERROR_ROUTE;
    const { default: Page } = await import("@/app/(app)/(lists)/e2e-error/page");
    await expect(Page()).rejects.toThrow("NOT_FOUND");
  });

  it("с чужим значением переменной тоже 404", async () => {
    process.env.E2E_FORCE_ERROR_ROUTE = "true";
    const { default: Page } = await import("@/app/(app)/(lists)/e2e-error/page");
    await expect(Page()).rejects.toThrow("NOT_FOUND");
  });

  it("включается только значением 1 (его задаёт e2e/serve.mjs) и только для вошедшего: без сессии переход на вход", async () => {
    process.env.E2E_FORCE_ERROR_ROUTE = "1";
    const { default: Page } = await import("@/app/(app)/(lists)/e2e-error/page");
    await expect(Page()).rejects.toThrow("REDIRECT:/login");
  });

  it("переменная нигде, кроме e2e/serve.mjs, не задаётся (Dockerfile, entrypoint, .env.example)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["Dockerfile", "docker-entrypoint.sh", ".env.example", "amvera.yaml"]) {
      expect(readFileSync(f, "utf8"), f).not.toContain("E2E_FORCE_ERROR_ROUTE");
    }
    expect(readFileSync("e2e/serve.mjs", "utf8")).toContain("E2E_FORCE_ERROR_ROUTE");
  });
});
