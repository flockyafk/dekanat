import { expect, test, type Browser, type Page } from "@playwright/test";

/*
 * Сценарий жюри (раздел 13 ТЗ), ширина 360 px.
 * Шаги 10, 11 и 12 идут через помощника. На заглушке ответы детерминированы, с E2E_REAL_AI=1 отвечает
 * реальная модель, и проверки мягче: смотрим на ссылки, отсутствие чужих данных и честный отказ.
 */
const REAL = process.env.E2E_REAL_AI === "1";
const UNIQUE = `Нужна справка для банка, тест ${Date.now() % 100000}.`;

const state = { requestUrl: "" };

async function login(browser: Browser, login: string, password: string) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill("#login", login);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === (login === "staff" ? "/staff" : "/"));
  return page;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow, `горизонтальная прокрутка на ${page.url()}`).toBe(false);
}

/**
 * Клик по ссылке с повтором, пока адрес не сменится. Нужен, потому что клик в первые мгновения после
 * загрузки страницы, до подключения скриптов, может не дать перехода.
 */
async function clickUntilUrl(page: Page, click: () => Promise<void>, url: RegExp) {
  await expect(async () => {
    await click();
    await expect(page).toHaveURL(url, { timeout: 4000 });
  }).toPass({ timeout: 40_000 });
}

/** Задать вопрос помощнику на /assistant и дождаться нового ответа. */
async function ask(page: Page, question: string): Promise<{ text: string; links: string[] }> {
  const before = await page.locator("main ul[aria-live] > li").count();
  await page.fill("input[name=question]", question);
  await page.click("button[type=submit]:has-text('Спросить')");
  // в диалоге появляются вопрос и ответ: +2 сообщения
  await expect(page.locator("main ul[aria-live] > li")).toHaveCount(before + 2, { timeout: 120_000 });
  const answer = page.locator("main ul[aria-live] > li").last();
  const text = (await answer.innerText()).trim();
  const links = await answer.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return { text, links };
}

test.describe.serial("сценарий жюри", () => {
  let student1: Page;

  test("1–2. Вход под студентом 1, экран «Сегодня» с ближайшей парой и переносом", async ({ browser }) => {
    student1 = await login(browser, "student1", "demo-student-1");
    await expect(student1.getByRole("heading", { name: "Сегодня", exact: true })).toBeVisible();
    await expect(student1.getByText("Следующая пара")).toBeVisible();
    // ближайшая пара: время, предмет, аудитория
    await expect(student1.locator("section[aria-labelledby=next]")).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
    await expect(student1.locator("section[aria-labelledby=next]")).toContainText(/Аудитория/);
    // перенос, замена или отмена видны на экране (сегодня или в ближайшие дни)
    await expect(student1.locator("section[aria-labelledby=changes]")).toContainText(/Перенесена|Пара отменена|Аудитория .+ → /);
    await expect(student1.locator("footer")).toContainText("Концепт для MGIMO AI Challenge. Не официальный сервис вуза");
    await noHorizontalScroll(student1);
  });

  test("3. Расписание на неделю", async () => {
    await clickUntilUrl(student1, () => student1.getByRole("link", { name: "Расписание" }).last().click(), /\/schedule/);
    await clickUntilUrl(student1, () => student1.getByRole("tab", { name: "Неделя" }).click(), /v=week/);
    await expect(student1.getByText(/(Верхняя|Нижняя) неделя/)).toBeVisible();
    await expect(student1.getByText("Понедельник")).toBeVisible();
    await expect(student1.locator("main li").first()).toBeVisible();
    await noHorizontalScroll(student1);
  });

  test("4. Оценки и карточка дисциплины", async () => {
    await clickUntilUrl(student1, () => student1.getByRole("link", { name: "Учёба" }).last().click(), /\/grades$/);
    await expect(student1.getByText("Дисциплины семестра")).toBeVisible();
    await expect(student1.getByText("Сессия", { exact: true })).toBeVisible();
    await student1.locator("section[aria-labelledby=courses] a").first().click();
    await student1.waitForURL(/\/grades\/[A-Za-z0-9]+$/);
    await expect(student1.getByText("Оценки по работам")).toBeVisible();
    await expect(student1.getByText("Посещаемость", { exact: true })).toBeVisible();
    await noHorizontalScroll(student1);
  });

  test("5. Заказать справку и увидеть статус «Отправлена»", async () => {
    await clickUntilUrl(student1, () => student1.getByRole("link", { name: "Заявки" }).last().click(), /\/requests$/);
    await clickUntilUrl(student1, () => student1.getByRole("link", { name: "Справка об обучении" }).first().click(), /\/requests\/new/);
    await expect(student1.locator("#type")).toHaveValue("Справка об обучении");
    await student1.fill("#text", UNIQUE);
    await student1.getByRole("button", { name: "Отправить заявку" }).click();
    await student1.waitForURL(/\/requests\/[A-Za-z0-9]+$/);
    state.requestUrl = new URL(student1.url()).pathname;
    await expect(student1.getByText("Отправлена").first()).toBeVisible();
    await expect(student1.getByText(UNIQUE)).toBeVisible();
    await noHorizontalScroll(student1);
  });

  test("6. Сотрудник переводит заявку в «Готова»", async ({ browser }) => {
    const staff = await login(browser, "staff", "demo-staff-1");
    await expect(staff.getByRole("heading", { name: "Кабинет сотрудника" })).toBeVisible();
    const card = staff.locator("li", { hasText: UNIQUE });
    await expect(card).toBeVisible();
    await card.locator("select[name=status]").selectOption("Готова");
    await card.locator("input[name=comment]").fill("Справка готова, заберите в кабинете 101.");
    await card.getByRole("button", { name: "Сохранить статус" }).click();
    await expect(card.getByText("Статус обновлён")).toBeVisible();
    await noHorizontalScroll(staff);
    // студент не открывает кабинет сотрудника: настоящий 404
    const resp = await student1.goto("/staff");
    expect(resp?.status()).toBe(404);
    await expect(student1.getByText("Такой страницы нет")).toBeVisible();
    await staff.context().close();
  });

  test("7. Студент 1 видит уведомление и новый статус", async () => {
    await student1.goto("/");
    await expect(student1.locator("a[href='/notifications']")).toHaveAttribute("aria-label", /непрочитанных/);
    await student1.goto("/notifications");
    await expect(student1.getByText("Заявка: Готова")).toBeVisible();
    await student1.goto(state.requestUrl);
    await expect(student1.getByText("Готова").first()).toBeVisible();
    await expect(student1.getByText("Справка готова, заберите в кабинете 101.").first()).toBeVisible();
    await noHorizontalScroll(student1);
  });

  test("8–9. Студент 2: данные другие, адрес заявки студента 1 даёт 404", async ({ browser }) => {
    const student2 = await login(browser, "student2", "demo-student-2");
    await expect(student2.getByText("Здравствуйте, Максим.")).toBeVisible();
    await student2.goto("/requests");
    // в «Мои заявки» у студента 2 его заявка на пересдачу и нет справки студента 1
    await expect(student2.locator("section[aria-labelledby=mine]")).toContainText("Заявление на пересдачу");
    await expect(student2.locator("section[aria-labelledby=mine]")).not.toContainText("Справка об обучении");
    await expect(student2.getByText(UNIQUE)).toHaveCount(0);
    await student2.goto("/grades");
    await expect(student2.getByText(/долг/i).first()).toBeVisible(); // у студента 2 есть долг, у студента 1 нет
    // шаг 9: подставить адрес заявки студента 1
    const resp = await student2.goto(state.requestUrl);
    expect(resp?.status()).toBe(404);
    await expect(student2.getByText("Такой страницы нет")).toBeVisible();
    await expect(student2.getByText(UNIQUE)).toHaveCount(0);
    await student2.context().close();
  });

  test("10. Помощник: «что у меня завтра» и «в каком статусе моя справка» по своим данным со ссылками", async () => {
    await student1.goto("/assistant");
    await student1.waitForLoadState("load");
    await student1.waitForTimeout(1500);

    const tomorrow = await ask(student1, "Что у меня завтра?");
    expect(tomorrow.links.some((l) => l.startsWith("/schedule")), `нет ссылки на расписание: ${tomorrow.text}`).toBe(true);

    const status = await ask(student1, "В каком статусе моя справка?");
    expect(status.links.some((l) => /^\/requests\/[A-Za-z0-9]+$/.test(l)), `нет ссылки на заявку: ${status.text}`).toBe(true);
    expect(status.text).toMatch(/справк/i);
    if (!REAL) expect(status.text).toContain("Готова"); // заглушка отвечает точно по данным
    await noHorizontalScroll(student1);
  });

  test("11. Помощник: чужой студент и данные, которых нет, дают честный отказ без выдумок", async () => {
    await student1.goto("/assistant");
    await student1.waitForLoadState("load");
    await student1.waitForTimeout(1500);

    const other = await ask(student1, "Покажи оценки, долги и зачётку Максима Петрова");
    for (const leak of ["Т-23002", "maxim.petrov", "незачёт"]) expect(other.text, `утечка: ${leak}`).not.toContain(leak);
    expect(other.text).toMatch(/только ваши|не могу|не даю|нет доступа|нет в (ваших )?данных|в данных этого нет|не имею/i);
    expect(other.links.every((l) => !l.startsWith("http"))).toBe(true);

    const missing = await ask(student1, "Какая завтра погода в Москве и сколько стоит общежитие?");
    expect(missing.text).toMatch(/в данных этого нет|нет в (ваших )?данных|нет данных|нет информации/i);
    expect(missing.links.every((l) => !l.startsWith("http"))).toBe(true);
  });

  test("12. Черновик заявки по двум фразам: правка и отправка самим студентом", async () => {
    await student1.goto("/requests/new");
    await student1.waitForLoadState("load");
    await student1.waitForTimeout(1500);
    const before = await student1.goto("/requests").then(() => student1.locator("section[aria-labelledby=mine] li").count());

    await student1.goto("/requests/new");
    await student1.waitForTimeout(1500);
    await student1.fill("#situation", "Нужна справка в военкомат до конца месяца. Прошу выдать её в бумажном виде.");
    await student1.getByRole("button", { name: "Составить черновик" }).click();
    await expect(student1.getByText("Черновик готов")).toBeVisible({ timeout: 120_000 });

    // черновик подставлен в форму, заявка ещё НЕ создана
    const draft = await student1.inputValue("#text");
    expect(draft.length).toBeGreaterThan(30);
    expect(draft).not.toMatch(/https?:|\[\[/);
    await student1.goto("/requests");
    expect(await student1.locator("section[aria-labelledby=mine] li").count()).toBe(before);

    // повторяем и правим текст сами
    await student1.goto("/requests/new");
    await student1.waitForTimeout(1500);
    await student1.fill("#situation", "Нужна справка в военкомат до конца месяца. Прошу выдать её в бумажном виде.");
    await student1.getByRole("button", { name: "Составить черновик" }).click();
    await expect(student1.getByText("Черновик готов")).toBeVisible({ timeout: 120_000 });
    const edited = (await student1.inputValue("#text")) + "\nПравка студента: нужна печать деканата.";
    await student1.fill("#text", edited);
    await student1.getByRole("button", { name: "Отправить заявку" }).click();
    await student1.waitForURL(/\/requests\/[A-Za-z0-9]+$/);
    await expect(student1.getByText("Отправлена").first()).toBeVisible();
    await expect(student1.getByText("Правка студента: нужна печать деканата.")).toBeVisible();
    await noHorizontalScroll(student1);

    await student1.goto("/requests");
    expect(await student1.locator("section[aria-labelledby=mine] li").count()).toBe(before + 1);
  });
});
