import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA: манифест и иконки", () => {
  const m = manifest();

  it("есть название, старт, режим приложения и подпись концепта", () => {
    expect(m.name).toBe("Мой деканат");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.description).toContain("Не официальный сервис вуза");
  });

  it("каждая иконка существует, это PNG заявленного размера; есть 192, 512 и maskable", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const i of icons) {
      const file = `public${i.src}`;
      expect(existsSync(file), file).toBe(true);
      const buf = readFileSync(file);
      expect(buf.subarray(1, 4).toString()).toBe("PNG");
      const [w, h] = String(i.sizes).split("x").map(Number);
      expect(buf.readUInt32BE(16)).toBe(w);
      expect(buf.readUInt32BE(20)).toBe(h);
    }
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
  });
});
