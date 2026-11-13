import { expect, test } from "@playwright/test";

/* Тёмная тема, пятый тестовый аккаунт и страница «О проекте». База e2e пересоздаётся при каждом запуске. */

async function login(page: import("@playwright/test").Page, name: string, password: string) {
  await page.goto("/login");
  await page.fill("#login", name);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === "/");
}

const bg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.use({ viewport: { width: 360, height: 740 }, colorScheme: "light" });

test("переключатель темы: меняет цвет, помнится после перезагрузки, подпись о концепте на месте", async ({ page }) => {
  await login(page, "student1", "demo-student-1");
  const lightBg = await bg(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: /Сменить тему/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bg(page)).not.toBe(lightBg);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Концепт для MGIMO AI Challenge. Не официальный сервис вуза")).toBeVisible();
  // на телефоне нет горизонтальной прокрутки и в тёмной теме
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(scroll).toBe(false);

  await page.getByRole("button", { name: /Сменить тему/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bg(page)).toBe(lightBg);
});

test("без выбора тема следует настройке системы", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await ctx.close();
});

test("/about показывает пятый аккаунт, а student4 может сменить пароль", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByText("student4")).toBeVisible();
  await expect(page.getByText("demo-student-4")).toBeVisible();

  // у student1 смена пароля заблокирована
  await login(page, "student1", "demo-student-1");
  await page.goto("/profile");
  await page.fill("#current", "demo-student-1");
  await page.fill("#next", "new-password-77");
  await page.fill("#repeat", "new-password-77");
  await page.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "менять нельзя" })).toBeVisible();
});

test("student4 меняет пароль и входит с новым", async ({ page }) => {
  await login(page, "student4", "demo-student-4");
  await page.goto("/profile");
  await page.fill("#current", "demo-student-4");
  await page.fill("#next", "new-password-77");
  await page.fill("#repeat", "new-password-77");
  await page.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Пароль изменён" })).toBeVisible();

  await page.context().clearCookies();
  await login(page, "student4", "new-password-77");
});
