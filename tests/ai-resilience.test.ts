import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { askAssistant, setAiProviderForTests, normalizeDashes, sanitizeAnswer } = await import("@/lib/ai");
const { getAssistantContext } = await import("@/lib/data/assistant");
const { getAiStats, resetAiStatsForTests } = await import("@/lib/ai-stats");
const { dateKey } = await import("@/lib/time");

const FAKE_KEY = "test-key-NOT-A-REAL-KEY-24680";
// Среда 11 ноября 2026: «в понедельник» это 16 ноября (верхняя неделя), у группы 1 две пары
const NOW = new Date("2026-11-11T09:00:00Z");
const SCHEDULE_Q = "Какие пары в понедельник?";
const DEBTS_Q = "Какие у меня долги?"; // без модели на такой вопрос не ответить

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}
const usage = async (login: string) =>
  (await prisma.aiUsage.findUnique({ where: { userId_date: { userId: (await userOf(login)).id, date: dateKey(NOW) } } }))?.count ?? 0;

let calls = 0;
type Step = number | "ok" | "timeout" | "network";
/** Подменяет сеть по сценарию: каждая попытка берёт следующий шаг (HTTP-статус, успех, таймаут или сеть). */
function script(steps: Step[], content = "Ответ модели.") {
  calls = 0;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    const step = steps[Math.min(calls, steps.length - 1)];
    calls += 1;
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "timeout") {
      return new Promise<Response>((_res, rej) =>
        init.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        }),
      );
    }
    if (step === "ok") {
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
    }
    return Promise.resolve(new Response(`{"error":"Billing pre-check failed ${FAKE_KEY}"}`, { status: step }));
  });
}

const savedEnv = { ...process.env };
beforeAll(async () => {
  expect(process.env.DATABASE_URL).toContain("test.db");
  await prisma.lessonChange.deleteMany(); // демо-переносы сида лежат и на этих датах
});
beforeEach(async () => {
  process.env.AI_PROVIDER = "amvera";
  process.env.AI_API_KEY = FAKE_KEY;
  process.env.AI_DAILY_LIMIT = "30";
  resetAiStatsForTests();
  await prisma.aiUsage.deleteMany();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAiProviderForTests(undefined);
  for (const k of ["AI_PROVIDER", "AI_API_KEY", "AI_TIMEOUT_MS", "AI_DAILY_LIMIT", "AI_RETRY_DELAY_MS", "AI_LOG"]) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});
afterAll(() => vi.unstubAllGlobals());

describe("ошибка модели: вопросы о расписании отвечает код, остальное «недоступен»", () => {
  for (const [name, steps] of [
    ["402", [402]],
    ["429", [429]],
    ["500", [500]],
    ["401", [401]],
    ["сеть", ["network"]],
  ] as [string, Step[]][]) {
    it(`${name}: на «${SCHEDULE_Q}» готовый ответ из кода в том же виде «Пары на … (… неделя): …»`, async () => {
      script(steps);
      const r = await askAssistant(await userOf("student2"), SCHEDULE_Q, NOW);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (!r.ok) return;
      expect(r.source).toBe("code");
      expect(r.text).toContain("Пары на понедельник, 16 ноября (верхняя неделя): 1) 09:00-10:30 Теория международных отношений, лекция, ауд. 301");
      expect(r.text).toContain("2) 10:40-12:10 Деловой английский, семинар, ауд. 412");
      expect(r.text).not.toMatch(/недоступен/i);
      expect(r.links.map((l) => l.href)).toEqual(["/schedule?d=2026-11-16&v=day"]);
      expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    });
  }

  it("таймаут: тоже ответ из кода, запрос при этом остаётся списанным (провайдер мог его выполнить)", async () => {
    process.env.AI_TIMEOUT_MS = "40";
    script(["timeout"]);
    const r = await askAssistant(await userOf("student2"), SCHEDULE_Q, NOW);
    expect(r).toMatchObject({ ok: true, source: "code" });
    expect(await usage("student2")).toBe(1);
  });

  it("при ошибке модели запрос возвращается в лимит (токены не списаны), ответ всё равно есть", async () => {
    script([402]);
    await askAssistant(await userOf("student2"), SCHEDULE_Q, NOW);
    expect(await usage("student2")).toBe(0);
  });

  it("ключ не задан: расписание из кода, остальное «недоступен», сеть не используется", async () => {
    delete process.env.AI_API_KEY;
    script(["ok"]);
    const sched = await askAssistant(await userOf("student1"), "Что у меня во вторник?", NOW);
    expect(sched).toMatchObject({ ok: true, source: "code" });
    if (sched.ok) expect(sched.text).toContain("вторник, 17 ноября (верхняя неделя)");
    const debts = await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
    expect(debts).toMatchObject({ ok: false, reason: "unavailable" });
    expect(calls).toBe(0);
  });

  it("402 на вопросе о долгах: честное «Помощник сейчас недоступен» (без модели не ответить)", async () => {
    script([402]);
    const r = await askAssistant(await userOf("student2"), DEBTS_Q, NOW);
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(r.text).toContain("Помощник сейчас недоступен");
    expect(r.text).toContain("Остальной кабинет работает");
  });

  it("ответ из кода только для своего студента: студент 3 получает свои пары, не пары студента 1", async () => {
    script([402]);
    const r = await askAssistant(await userOf("student3"), SCHEDULE_Q, NOW);
    expect(r.ok && r.text).toContain("Мировая экономика, лекция, ауд. 210");
    expect(r.ok && r.text).not.toContain("Теория международных отношений");
    expect(r.ok && r.text).not.toContain("ауд. 301");
  });

  it("ответ из кода и ответ модели дают одинаковый список пар (оба из одних данных)", async () => {
    script(["ok"], "Пересказ модели.");
    const model = await askAssistant(await userOf("student1"), SCHEDULE_Q, NOW);
    expect(model.ok && model.source).toBe("model");
    const ctx = await getAssistantContext(await userOf("student1"), NOW, SCHEDULE_Q);
    script([402]);
    const code = await askAssistant(await userOf("student1"), SCHEDULE_Q, NOW);
    expect(code.ok && code.text).toBe(normalizeDashes(ctx.scheduleAnswer[0].text));
  });
});

describe("повтор запроса к модели", () => {
  it("402, затем успех: ровно две попытки, ответ модели, суточный лимит списан ОДИН раз", async () => {
    script([402, "ok"], "Долгов нет.\n[[/grades|Учёба]]");
    const r = await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
    expect(calls).toBe(2);
    expect(r).toMatchObject({ ok: true, source: "model" });
    expect(await usage("student1")).toBe(1);
    expect(getAiStats().recovered).toBe(1);
  });

  it("повтор не требует второго места в лимите: при лимите 1 запрос с повтором проходит", async () => {
    process.env.AI_DAILY_LIMIT = "1";
    script([402, "ok"], "Долгов нет.\n[[/grades|Учёба]]");
    const s1 = await userOf("student1");
    expect(await askAssistant(s1, DEBTS_Q, NOW)).toMatchObject({ ok: true });
    expect(calls).toBe(2);
    expect(await usage("student1")).toBe(1);
    // а следующий вопрос уже упирается в лимит
    expect(await askAssistant(s1, DEBTS_Q, NOW)).toMatchObject({ ok: false, reason: "limit" });
  });

  for (const status of [402, 429, 500, 503] as const) {
    it(`${status}: повтор происходит ОДИН раз (две попытки всего), потом «недоступен»`, async () => {
      script([status]);
      const r = await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
      expect(calls).toBe(2);
      expect(r).toMatchObject({ ok: false, reason: "unavailable" });
      expect(await usage("student1")).toBe(0); // токены не потрачены, запрос возвращён
    });
  }

  it("таймаут: тоже одна повторная попытка", async () => {
    process.env.AI_TIMEOUT_MS = "40";
    script(["timeout"]);
    const r = await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
    expect(calls).toBe(2);
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await usage("student1")).toBe(1); // после таймаута запрос не возвращается
  });

  for (const status of [400, 401, 403] as const) {
    it(`${status}: повтора нет (одна попытка)`, async () => {
      script([status]);
      await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
      expect(calls).toBe(1);
    });
  }

  it("сетевая ошибка и пустой ответ без повтора", async () => {
    script(["network"]);
    await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
    expect(calls).toBe(1);
    vi.unstubAllGlobals();
    calls = 0;
    vi.stubGlobal("fetch", () => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    });
    await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
    expect(calls).toBe(1);
  });

  it("между попытками пауза (задана AI_RETRY_DELAY_MS)", async () => {
    process.env.AI_RETRY_DELAY_MS = "250";
    script([402, "ok"], "Долгов нет.\n[[/grades|Учёба]]");
    const started = Date.now();
    await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
    expect(Date.now() - started).toBeGreaterThanOrEqual(240);
  });
});

describe("журнал и счётчик ошибок (без текста вопросов и ключа)", () => {
  it("по каждой ошибке пишется статус, номер попытки и время, по успеху после повтора «recovered»", async () => {
    process.env.AI_LOG = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const secretQuestion = "СЕКРЕТНЫЙ-ВОПРОС-про-долги-98765";
      script([402, "ok"], "Долгов нет.\n[[/grades|Учёба]]");
      await askAssistant(await userOf("student1"), `${secretQuestion} ${DEBTS_Q}`, NOW);
      const lines = warn.mock.calls.map((c) => String(c[0]));
      const error = lines.map((l) => JSON.parse(l)).find((l) => l.ai === "error");
      expect(error).toMatchObject({ ai: "error", status: "402", attempt: 1, willRetry: true });
      expect(typeof error.ms).toBe("number");
      expect(typeof error.t).toBe("string");
      expect(lines.map((l) => JSON.parse(l)).some((l) => l.ai === "recovered" && l.afterStatus === "402")).toBe(true);
      // в журнале нет вопроса, ключа и ответов
      const all = lines.join("\n");
      expect(all).not.toContain(secretQuestion);
      expect(all).not.toContain(FAKE_KEY);
      expect(all).not.toContain("Долгов нет");
      expect(all).not.toContain("student1");
      expect(getAiStats().errorsByStatus["402"]).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("счётчик накапливает ошибки по статусам, в том числе таймаут и сеть", async () => {
    process.env.AI_TIMEOUT_MS = "40";
    const s1 = await userOf("student1");
    script([429]);
    await askAssistant(s1, DEBTS_Q, NOW);
    script([500]);
    await askAssistant(s1, DEBTS_Q, NOW);
    script(["timeout"]);
    await askAssistant(s1, DEBTS_Q, NOW);
    script(["network"]);
    await askAssistant(s1, DEBTS_Q, NOW);
    const stats = getAiStats();
    expect(stats.errorsByStatus).toMatchObject({ "429": 2, "500": 2, timeout: 2, network: 1 });
    expect(stats.retries).toBe(3 + 0); // 429, 500, timeout повторялись, сеть нет
    expect(stats.requests).toBe(4);
  });

  it("ответ из кода тоже записывается (fallback) с последним статусом", async () => {
    process.env.AI_LOG = "1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      script([402]);
      await askAssistant(await userOf("student1"), SCHEDULE_Q, NOW);
      const events = warn.mock.calls.map((c) => JSON.parse(String(c[0])));
      expect(events.some((e) => e.ai === "fallback" && e.lastStatus === "402")).toBe(true);
      expect(getAiStats().fallbackAnswers).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("в тестах без AI_LOG журнал молчит", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      script([402]);
      await askAssistant(await userOf("student1"), DEBTS_Q, NOW);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("тексты ответов: без длинного тире, время дедлайна называется", () => {
  it("normalizeDashes: диапазоны через дефис, между словами запятая", () => {
    expect(normalizeDashes("10:40–12:10 — Мировая экономика")).toBe("10:40-12:10, Мировая экономика");
    expect(normalizeDashes("Завтра — две пары, 09:00 – 10:30")).toBe("Завтра, две пары, 09:00-10:30");
    expect(normalizeDashes("кто-то — это да―нет")).toBe("кто-то, это да-нет");
    expect(normalizeDashes("— пункт списка")).toBe("- пункт списка");
    expect(normalizeDashes("Обычный дефис - остаётся, кто-то")).toBe("Обычный дефис - остаётся, кто-то"); // обычный дефис не трогаем
  });

  it("ответ модели с длинными тире приходит студенту без них", () => {
    const ctx = { courses: [], requests: [] } as never;
    const out = sanitizeAnswer("Завтра, 12 ноября — две пары:\n10:40–12:10 — Мировая экономика\n12:40–14:10 — Теория", ctx);
    expect(out.text).not.toMatch(/[—–―]/);
    expect(out.text).toContain("10:40-12:10, Мировая экономика");
  });

  it("ответы заглушки и ответ из кода не содержат длинного тире", async () => {
    setAiProviderForTests(undefined);
    process.env.AI_PROVIDER = "stub";
    for (const q of [SCHEDULE_Q, DEBTS_Q, "Какой у меня средний балл?", "Что нового в объявлениях?", "Когда ближайший дедлайн?"]) {
      const r = await askAssistant(await userOf("student1"), q, NOW);
      expect(r.ok && r.text, q).not.toMatch(/[—–―]/);
    }
  });

  it("в контексте дедлайны с датой и временем вместе (dueText), время по Москве", async () => {
    const ctx = await getAssistantContext(await userOf("student1"), new Date("2026-11-12T09:00:00Z"), "Когда ближайший дедлайн?");
    const essay = ctx.deadlines.find((d) => d.title === "Сдать эссе по ТМО");
    expect(essay).toMatchObject({ due: "2026-11-14", dueText: "14 ноября в 18:00" });
  });

  it("ответ на вопрос о дедлайне называет время (в данных 18:00)", async () => {
    process.env.AI_PROVIDER = "stub";
    const r = await askAssistant(await userOf("student1"), "Когда ближайший дедлайн?", new Date("2026-11-12T09:00:00Z"));
    expect(r.ok && r.text).toContain("14 ноября в 18:00: Сдать эссе по ТМО");
    const r3 = await askAssistant(await userOf("student3"), "Когда ближайший дедлайн?", new Date("2026-11-12T09:00:00Z"));
    expect(r3.ok && r3.text).toContain("16 ноября в 18:00: Лабораторная 2 по статистике");
    expect(r3.ok && r3.text).not.toContain("Сдать эссе по ТМО"); // дедлайн чужой группы
  });
});
