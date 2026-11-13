import { expect, test, type Page } from "@playwright/test";

/* Поиск по своим данным на 360 px: пустое состояние, результаты, «ничего не найдено», изоляция студентов. */
test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

async function login(page: Page, name: string, password: string, home = "/") {
  await page.goto("/login");
  await page.fill("#login", name);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === home);
}

async function noHScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("студент: поиск из шапки, результаты ведут в разделы, без горизонтальной прокрутки", async ({ page }) => {
  await login(page, "student1", "demo-student-1");
  await page.getByRole("link", { name: "Поиск" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByText("Ищем по вашему расписанию")).toBeVisible();

  const input = page.getByRole("searchbox");
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await input.fill("теория");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("status")).toContainText("Найдено");
  await expect(page.getByRole("link", { name: /Теория международных отношений/ }).first()).toBeVisible();
  await noHScroll(page);

  // результат ведёт на карточку дисциплины
  await page.getByRole("link", { name: /Теория международных отношений/ }).first().click();
  await expect(page).toHaveURL(/\/grades\/|\/schedule/);

  await page.goto("/search?q=zzzzqqq");
  await expect(page.getByText("ничего не нашлось")).toBeVisible();
  await page.goto("/search?q=т");
  await expect(page.getByText("хотя бы 2")).toBeVisible();
  await noHScroll(page);
});

test("студент 3 не находит дисциплину студента 1, а свою находит", async ({ page }) => {
  await login(page, "student3", "demo-student-3");
  await page.goto("/search?q=" + encodeURIComponent("теория международных"));
  await expect(page.getByText("ничего не нашлось")).toBeVisible();
  await page.goto("/search?q=" + encodeURIComponent("статистика"));
  await expect(page.getByRole("status")).toContainText("Найдено");
});

test("сотрудник: ссылки на поиск нет, /search ведёт в /staff", async ({ page }) => {
  await login(page, "staff", "demo-staff-1", "/staff");
  await expect(page.getByRole("link", { name: "Поиск" })).toHaveCount(0);
  await page.goto("/search");
  await expect(page).toHaveURL(/\/staff$/);
});
