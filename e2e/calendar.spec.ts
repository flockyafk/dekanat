import { expect, test, type Page } from "@playwright/test";

/* Экспорт расписания в .ics: кнопка на /schedule, файл только для вошедшего студента. */
test.use({ viewport: { width: 360, height: 740 } });

async function login(page: Page, name: string, password: string, home = "/") {
  await page.goto("/login");
  await page.fill("#login", name);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === home);
}

test("студент: кнопка на 360 px, файл .ics со своими парами", async ({ page }) => {
  await login(page, "student1", "demo-student-1");
  await page.goto("/schedule");
  const link = page.getByRole("link", { name: /Добавить в календарь/ });
  await expect(link).toBeVisible();
  const box = (await link.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  expect(box.x + box.width).toBeLessThanOrEqual(360);

  const res = await page.request.get("/schedule.ics");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("Теория международных отношений");
  expect(body).not.toContain("Статистика");
});

test("без входа 401, у сотрудника 404", async ({ page, browser }) => {
  const anon = await browser.newContext();
  expect((await anon.request.get("/schedule.ics")).status()).toBe(401);
  await anon.close();
  await login(page, "staff", "demo-staff-1", "/staff");
  expect((await page.request.get("/schedule.ics")).status()).toBe(404);
});
