import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Правило 11: все вызовы ИИ идут только через lib/ai.ts. Тест сканирует исходники приложения.
const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "lib", "components"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((p) => ({
  rel: path.relative(ROOT, p).replace(/\\/g, "/"),
  src: readFileSync(p, "utf8"),
}));

const AI_FILES = ["lib/ai.ts", "lib/ai-prompt.ts"];

describe("ИИ вызывается только через lib/ai.ts", () => {
  it("сканируются файлы приложения", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.rel === "lib/ai.ts")).toBe(true);
  });

  it("вне lib/ai.ts нет сетевых вызовов и SDK провайдеров", () => {
    const sdk = /from\s+["'](openai|@anthropic-ai\/[^"']*|anthropic|@google\/[^"']*|@google-ai\/[^"']*|cohere-ai|@mistralai\/[^"']*|ollama|langchain[^"']*|ai|@ai-sdk\/[^"']*)["']/;
    for (const f of files) {
      if (AI_FILES.includes(f.rel)) continue;
      expect(/\bfetch\s*\(/.test(f.src), `fetch( в ${f.rel}`).toBe(false);
      expect(/\baxios\b|XMLHttpRequest|node:https?["']/.test(f.src), `сетевой клиент в ${f.rel}`).toBe(false);
      expect(sdk.test(f.src), `SDK провайдера в ${f.rel}`).toBe(false);
    }
  });

  it("методы провайдера и ключи читаются только в lib/ai.ts", () => {
    for (const f of files) {
      if (AI_FILES.includes(f.rel)) continue;
      expect(/\.complete\s*\(/.test(f.src), `.complete( в ${f.rel}`).toBe(false);
      expect(/process\.env\.AI_(PROVIDER|API_KEY|KEY|TIMEOUT_MS)|API_KEY|SECRET_KEY/.test(f.src), `ключ или настройка ИИ в ${f.rel}`).toBe(false);
    }
  });

  it("askAssistant вызывают только серверное действие помощника и тесты", () => {
    const callers = files.filter((f) => /\baskAssistant\s*\(/.test(f.src) && f.rel !== "lib/ai.ts").map((f) => f.rel);
    expect(callers).toEqual(["app/(app)/(lists)/assistant/actions.ts"]);
  });

  it("секреты не попадают в клиентский код: нет NEXT_PUBLIC_ и ключей в компонентах", () => {
    for (const f of files) {
      expect(/NEXT_PUBLIC_/.test(f.src), `NEXT_PUBLIC_ в ${f.rel}`).toBe(false);
    }
    for (const f of files.filter((x) => x.src.startsWith('"use client"'))) {
      expect(/process\.env/.test(f.src), `process.env в клиентском ${f.rel}`).toBe(false);
      expect(/@\/lib\/ai["']/.test(f.src.replace(/import type[^\n]*\n/g, "")), `клиентский ${f.rel} импортирует lib/ai`).toBe(false);
    }
  });
});
