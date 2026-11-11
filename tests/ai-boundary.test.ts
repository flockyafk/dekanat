import { execSync } from "node:child_process";
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

  it("черновик заявки вызывает только серверное действие формы заявки", () => {
    const callers = files.filter((f) => /\bdraftRequest\s*\(/.test(f.src) && f.rel !== "lib/ai.ts").map((f) => f.rel);
    expect(callers).toEqual(["app/(app)/(lists)/requests/new/actions.ts"]);
  });

  it("ключ провайдера не лежит в коде и не попадает в git", () => {
    // в исходниках нет похожих на ключ строк
    for (const f of files) {
      expect(/Bearer\s+[A-Za-z0-9._-]{20,}/.test(f.src), `ключ в ${f.rel}`).toBe(false);
      expect(/\bsk-[A-Za-z0-9]{20,}/.test(f.src), `ключ в ${f.rel}`).toBe(false);
    }
    // .env.example без значения, .env и база в .gitignore
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(/^AI_API_KEY=$/m.test(example), ".env.example: AI_API_KEY должен быть пустым").toBe(true);
    const ignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8").split(/\r?\n/);
    expect(ignore).toContain(".env");
    expect(ignore).toContain("/data/");
    // в репозитории (git ls-files) нет .env, базы и данных
    const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    expect(tracked.filter((t) => t === ".env" || /^data\//.test(t) || /\.db(-journal)?$/.test(t))).toEqual([]);
    expect(tracked).toContain(".env.example");
  });

  it("настоящее значение ключа из .env не встречается ни в одном файле git и ни в одном отчёте", () => {
    // Значение читается из .env прямо здесь и нигде не выводится. Если .env нет (чистая машина), проверка пропускается.
    let key = "";
    try {
      const env = readFileSync(path.join(ROOT, ".env"), "utf8");
      key = /^AI_API_KEY=["']?([^"'\r\n]+)["']?\s*$/m.exec(env)?.[1]?.trim() ?? "";
    } catch {
      return;
    }
    if (key.length < 12) return;
    const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const extra = ["docs/redteam-results.md", "docs/redteam-results-run1-prompt-v1.md", "docs/redteam-results-run2-prompt-v2.md"];
    const leaked: string[] = [];
    for (const rel of new Set([...tracked, ...extra])) {
      let text = "";
      try {
        text = readFileSync(path.join(ROOT, rel), "utf8");
      } catch {
        continue; // удалённый или бинарный файл
      }
      if (text.includes(key)) leaked.push(rel);
    }
    expect(leaked, "ключ найден в файлах (значение не показываю)").toEqual([]);
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
