import { expect, test, type Browser, type Page } from "@playwright/test";

/*
 * Телефон от 360 px: на каждом экране нет горизонтальной прокрутки, нет обрезанного текста, все области нажатия
 * не меньше 44 px, подпись о концепте видна и не закрыта нижним меню, нижнее меню на месте (у студента пять пунктов,
 * у сотрудника четыре), работа с клавиатуры. Отдельно: состояния загрузки, пустоты и ошибки.
 * Запускается вместе со сценарием жюри: npm run e2e.
 */
/** Нижнее меню телефона (в разметке есть ещё боковое, оно на телефоне скрыто). */
const bottomNav = (page: Page) => page.locator("nav.fixed[aria-label='Основное меню']");

const SIGNATURE = "Концепт для MGIMO AI Challenge. Не официальный сервис вуза";

async function login(browser: Browser, loginName: string, password: string) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill("#login", loginName);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === (loginName === "staff" ? "/staff" : "/"));
  return page;
}

type Audit = {
  hScroll: boolean;
  small: string[];
  clipped: string[];
  outside: string[];
  footerVisible: boolean;
  navItems: number;
  h1: number;
};

/** Проверка экрана на ширине 360 px. Всё считается в браузере по реальной вёрстке. */
async function audit(page: Page): Promise<Audit> {
  await page.waitForLoadState("load");
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest(".sr-only");
    };
    const label = (el: Element) => (el.textContent || el.getAttribute("aria-label") || (el as HTMLInputElement).id || "").trim().slice(0, 28);

    const small: string[] = [];
    for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab]")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) small.push(`${el.tagName.toLowerCase()} «${label(el)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    }

    const clipped: string[] = [];
    for (const el of document.querySelectorAll("main *, header *, nav *, footer *")) {
      const s = getComputedStyle(el);
      if ((s.overflowX === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && visible(el)) {
        clipped.push(`${el.tagName.toLowerCase()} «${label(el)}»`);
      }
    }

    const outside: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) outside.push(`${el.tagName.toLowerCase()} «${label(el)}» ${Math.round(r.left)}..${Math.round(r.right)}`);
    }

    // подпись видна, если после прокрутки вниз в точке её текста лежит сама подпись, а не нижнее меню
    window.scrollTo(0, document.body.scrollHeight);
    const footer = document.querySelector("footer");
    let footerVisible = false;
    if (footer && footer.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(footer);
      const rect = range.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      footerVisible = Boolean(top && footer.contains(top)) && rect.bottom <= window.innerHeight + 1;
    }

    const nav = [...document.querySelectorAll("nav[aria-label='Основное меню']")].find((n) => visible(n)) ?? null;
    return {
      hScroll: document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw,
      small,
      clipped,
      outside,
      footerVisible,
      navItems: nav ? nav.querySelectorAll("li").length : 0,
      h1: document.querySelectorAll("h1").length,
    };
  });
}

async function expectGood(page: Page, expectedNav: number, where: string) {
  const a = await audit(page);
  expect(a.hScroll, `${where}: горизонтальная прокрутка`).toBe(false);
  expect(a.small, `${where}: области нажатия меньше 44 px`).toEqual([]);
  expect(a.clipped, `${where}: обрезанный текст`).toEqual([]);
  expect(a.outside, `${where}: элементы вылезают за экран`).toEqual([]);
  expect(a.footerVisible, `${where}: подпись о концепте не видна или закрыта меню`).toBe(true);
  expect(a.navItems, `${where}: пунктов нижнего меню`).toBe(expectedNav);
  expect(a.h1, `${where}: должен быть один заголовок h1`).toBe(1);
  await expect(page.locator("footer")).toContainText(SIGNATURE);
  expect(await page.locator("html").getAttribute("lang")).toBe("ru");
  expect((await page.title()).length, `${where}: заголовок вкладки`).toBeGreaterThan(3);
}

test.describe("студент 1: все экраны на 360 px", () => {
  test("экраны кабинета", async ({ browser }) => {
    const page = await login(browser, "student1", "demo-student-1");
    const routes = [
      "/",
      "/schedule",
      "/schedule?d=2026-11-16&v=week",
      "/grades",
      "/requests",
      "/requests/new",
      "/notifications",
      "/assistant",
      "/profile",
    ];
    for (const route of routes) {
      await page.goto(route);
      await expectGood(page, 5, route);
    }
    // страницы по id: берём ссылки с экранов
    await page.goto("/grades");
    const course = await page.locator("section[aria-labelledby=courses] a").first().getAttribute("href");
    await page.goto(course!);
    await expectGood(page, 5, course!);
    await page.goto("/requests");
    const request = await page.locator("section[aria-labelledby=mine] a").first().getAttribute("href");
    await page.goto(request!);
    await expectGood(page, 5, request!);
    await page.context().close();
  });

  test("страница 404 и «О проекте»", async ({ browser }) => {
    const page = await login(browser, "student1", "demo-student-1");
    const resp = await page.goto("/no-such-page");
    expect(resp?.status()).toBe(404);
    await expectGood(page, 0, "/no-such-page (в кабинете)");
    await page.goto("/about");
    await expectGood(page, 0, "/about");
    await expect(page.getByRole("link", { name: "В кабинет" })).toBeVisible();
    await page.context().close();
  });
});

test.describe("студент 2 и студент без данных", () => {
  test("студент 2: основные экраны", async ({ browser }) => {
    const page = await login(browser, "student2", "demo-student-2");
    for (const route of ["/", "/grades", "/requests"]) {
      await page.goto(route);
      await expectGood(page, 5, route);
    }
    await page.context().close();
  });

  test("студент без данных: все экраны в состоянии «пусто» и понятные тексты", async ({ browser }) => {
    const page = await login(browser, "empty1", "demo-empty-1");
    const expectText = async (route: string, texts: (string | RegExp)[]) => {
      await page.goto(route);
      await expect(page.locator("main[aria-busy='true']")).toHaveCount(0); // скелетон ушёл
      for (const t of texts) await expect(page.locator("main")).toContainText(t);
      await expectGood(page, 5, `${route} (пусто)`);
    };
    await expectText("/", ["Ближайших пар нет.", "Изменений нет.", "Срочных дел нет."]);
    await expectText("/schedule", [/пар нет/]);
    await expectText("/schedule?v=week", ["Пар нет"]);
    await expectText("/grades", ["В этом семестре дисциплин нет.", "Назначенных зачётов и экзаменов нет.", "Результатов пока нет.", "Всё в порядке"]);
    await expectText("/requests", ["Заявок пока нет."]);
    await expectText("/assistant", ["Помощник отвечает по вашему расписанию"]);
    await expectText("/profile", ["Пустов Павел Павлович"]);
    await page.context().close();
  });
});

test.describe("сотрудник: меню, подпись и экраны", () => {
  test("нижнее меню из четырёх пунктов и подпись над ним на /staff", async ({ browser }) => {
    const page = await login(browser, "staff", "demo-staff-1");
    await page.goto("/staff");
    await expectGood(page, 4, "/staff");
    const nav = bottomNav(page);
    for (const name of ["Заявки", "Уведомления", "О проекте", "Выйти"]) {
      await expect(nav.getByText(name, { exact: true })).toBeVisible();
    }
    // безопасный выбор статуса: по умолчанию ничего не выбрано, пустое сохранение отклоняется, заявка не меняется
    const card = page.locator("main li", { has: page.locator("select[name=status]") }).first();
    await expect(card.locator("select[name=status]")).toHaveValue("");
    const statusBefore = await card.locator("[class*=rounded-sm]").first().innerText();
    await card.getByRole("button", { name: "Сохранить статус" }).click();
    await expect(card.getByRole("alert")).toContainText("Выберите статус");
    expect(await card.locator("[class*=rounded-sm]").first().innerText()).toBe(statusBefore);
    // состояние «пусто» у фильтра и остальные экраны сотрудника
    await page.goto("/staff?status=Отклонена");
    await expect(page.locator("main")).toContainText("Заявок с таким статусом нет.");
    await expectGood(page, 4, "/staff?status=Отклонена");
    await page.goto("/notifications");
    await expectGood(page, 4, "/notifications (сотрудник)");
    // пункт меню работает: переход в «Уведомления» и обратно
    await nav.getByText("Уведомления", { exact: true }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await bottomNav(page).getByText("Заявки", { exact: true }).click();
    await expect(page).toHaveURL(/\/staff$/);
    await page.context().close();
  });

  test("объявление: форма свёрнута, открывается одним касанием, публикуется, студент его видит", async ({ browser }) => {
    const staff = await login(browser, "staff", "demo-staff-1");
    await staff.goto("/staff");
    const details = staff.locator("details#announce");
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click(); // касание по заголовку раскрывает форму
    await expect(staff.locator("#an-title")).toBeVisible();
    // поле группы нужно только для «Одной группе»
    await expect(staff.locator("#an-group")).toHaveCount(0);
    await staff.selectOption("#an-audience", "group");
    await expect(staff.locator("#an-group")).toBeVisible();
    await staff.selectOption("#an-audience", "all");
    await expect(staff.locator("#an-group")).toHaveCount(0);
    const title = `Проверка объявления ${Date.now() % 100000}`;
    await staff.fill("#an-title", title);
    await staff.fill("#an-body", "Занятия в субботу проходят по обычному расписанию.");
    await staff.getByRole("button", { name: "Опубликовать" }).click();
    await expect(staff.getByText("Объявление опубликовано")).toBeVisible();
    await expectGood(staff, 4, "/staff (форма открыта)");
    await staff.context().close();

    const student = await login(browser, "student1", "demo-student-1");
    await student.goto("/notifications");
    await expect(student.locator("main[aria-busy='true']")).toHaveCount(0); // скелетон ушёл
    await expect(student.locator("main")).toContainText(title);
    await student.context().close();
  });

  test("«О проекте» открывается из меню, оттуда можно вернуться в кабинет, «Выйти» завершает сессию", async ({ browser }) => {
    const page = await login(browser, "staff", "demo-staff-1");
    await bottomNav(page).getByText("О проекте", { exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator("footer")).toContainText(SIGNATURE);
    await page.getByRole("link", { name: "В кабинет" }).click();
    await expect(page).toHaveURL(/\/staff$/);
    await bottomNav(page).getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    const resp = await page.goto("/staff");
    expect(page.url()).toMatch(/\/login$/); // без входа кабинет сотрудника недоступен
    expect(resp?.ok()).toBe(true);
    await page.context().close();
  });
});

test.describe("гость", () => {
  test("вход и «О проекте» на 360 px, подпись видна, меню нет", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto("/login");
    await expectGood(page, 0, "/login");
    await page.goto("/about");
    await expectGood(page, 0, "/about (гость)");
    await expect(page.getByRole("link", { name: "Ко входу" })).toBeVisible();
    await context.close();
  });
});

test.describe("три состояния: загрузка, пусто, ошибка", () => {
  test("состояние загрузки: скелетон виден, пока страница грузится", async ({ browser }) => {
    const page = await login(browser, "student1", "demo-student-1");
    await page.waitForTimeout(2000); // дать предзагрузке отработать
    // задерживаем только настоящий переход (не предзагрузку), чтобы успеть увидеть экран загрузки
    await page.route(/\/grades\?_rsc=/, async (route) => {
      if (route.request().headers()["next-router-prefetch"]) return route.continue();
      await new Promise((r) => setTimeout(r, 2500));
      return route.continue();
    });
    await bottomNav(page).getByText("Учёба", { exact: true }).click();
    const skeleton = page.locator("main[aria-busy='true'][aria-label='Загрузка']");
    await expect(skeleton).toBeVisible({ timeout: 2000 });
    await expect(skeleton).toContainText("Загружаем данные");
    await expect(page.getByText("Дисциплины семестра")).toBeVisible({ timeout: 15_000 });
    await page.context().close();
  });

  test("состояние ошибки: понятное сообщение, повтор и выход на «Сегодня», подпись на месте", async ({ browser }) => {
    const page = await login(browser, "student1", "demo-student-1");
    await page.goto("/e2e-error");
    const alert = page.locator("main [role=alert]");
    await expect(alert).toContainText("Не получилось загрузить страницу.");
    await expect(alert).toContainText("Остальной кабинет работает");
    await expect(alert.getByRole("button", { name: "Попробовать снова" })).toBeVisible();
    await expect(alert.getByRole("link", { name: "На экран «Сегодня»" })).toBeVisible();
    await expectGood(page, 5, "/e2e-error (ошибка)");
    // кабинет при этом работает
    await alert.getByRole("link", { name: "На экран «Сегодня»" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Сегодня", exact: true })).toBeVisible();
    await page.context().close();
  });
});

test.describe("клавиатура", () => {
  test("первый Tab показывает «К содержимому», фокус виден, меню достижимо с клавиатуры", async ({ browser }) => {
    const page = await login(browser, "student1", "demo-student-1");
    await page.goto("/profile");
    await page.waitForLoadState("load");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "К содержимому" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    // у сфокусированного элемента есть видимая рамка
    const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#content$/);
    // меню достижимо: проходим Tab до ссылки «Учёба» и открываем её с клавиатуры
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const focusedName = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
      if (focusedName === "Учёба") break;
    }
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/grades$/);
    await page.context().close();
  });
});
