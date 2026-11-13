import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Контраст WCAG AA (не меньше 4,5:1 для обычного текста) для всех пар «текст на фоне» в обеих темах.
// Цвета читаются прямо из app/globals.css, поэтому тест ловит любую правку палитры.
const css = readFileSync("app/globals.css", "utf8");

function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = vars(css.match(/@theme\s*\{([\s\S]*?)\n\}/)![1]);
const dark = { ...light, ...vars(css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)![1]) };
const darkMedia = {
  ...light,
  ...vars(css.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\r?\n\}/)![1]),
};

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [текст, фон]
const PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["muted", "background"],
  ["muted", "surface"],
  ["muted", "brand-soft"],
  ["foreground", "brand-soft"],
  ["brand", "surface"],
  ["brand", "background"],
  ["brand", "brand-soft"],
  ["on-accent", "brand"],
  ["on-accent", "danger"],
  ["danger", "danger-bg"],
  ["warn", "warn-bg"],
  ["ok", "ok-bg"],
  ["danger", "surface"],
  ["foreground", "warn-bg"],
];

describe("контраст WCAG AA", () => {
  for (const [name, theme] of [["светлая", light], ["тёмная", dark], ["тёмная по настройке системы", darkMedia]] as const) {
    it(`${name} тема: все пары не ниже 4,5:1`, () => {
      const bad = PAIRS.filter(([t, b]) => ratio(theme[t], theme[b]) < 4.5).map(
        ([t, b]) => `${t} на ${b}: ${ratio(theme[t], theme[b]).toFixed(2)}`,
      );
      expect(bad).toEqual([]);
    });
  }

  it("тёмные значения действительно отличаются от светлых", () => {
    expect(dark.background).not.toBe(light.background);
    expect(darkMedia).toEqual(dark);
  });
});
