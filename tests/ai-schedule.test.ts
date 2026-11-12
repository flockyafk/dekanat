import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { askAssistant, assistantMode, setAiProviderForTests } = await import("@/lib/ai");
const { getAssistantContext } = await import("@/lib/data/assistant");
const { resolveScheduleDates, describeDate } = await import("@/lib/ai-schedule");
const { dayStart } = await import("@/lib/time");

type Captured = { system: string; data: string; question: string };

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

// Среда 11 ноября 2026 (нижняя неделя). Понедельник 16 ноября и вторник 17 ноября верхней недели, 24 ноября нижней.
const NOW = new Date("2026-11-11T09:00:00Z");
const TODAY = "2026-11-11";

function spy() {
  const calls: Captured[] = [];
  setAiProviderForTests({
    name: "spy",
    async complete(req) {
      calls.push(req);
      return "ок";
    },
  });
  return calls;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toContain("test.db");
  // демо-переносы из сида привязаны к реальной дате и могли бы попасть на проверяемые дни
  await prisma.lessonChange.deleteMany();
  await prisma.aiUsage.deleteMany();
});
afterEach(async () => {
  setAiProviderForTests(undefined);
  await prisma.aiUsage.deleteMany();
});
afterAll(() => setAiProviderForTests(undefined));

describe("разбор вопроса о расписании делает код (resolveScheduleDates)", () => {
  const r = (q: string, today = TODAY) => resolveScheduleDates(q, today);

  it("день недели: ближайший БУДУЩИЙ понедельник и вторник", () => {
    expect(r("Какие пары в понедельник?")).toEqual(["2026-11-16"]);
    expect(r("Что у меня во вторник?")).toEqual(["2026-11-17"]);
    expect(r("а в четверг что?")).toEqual(["2026-11-12"]);
    expect(r("Какие пары в субботу?")).toEqual(["2026-11-14"]);
    expect(r("Что в воскресенье?")).toEqual(["2026-11-15"]);
  });

  it("если сегодня тот же день недели, берётся следующая неделя", () => {
    expect(r("Какие пары в среду?")).toEqual(["2026-11-18"]);
    expect(r("в понедельник", "2026-11-16")).toEqual(["2026-11-23"]);
  });

  it("«сегодня», «завтра», «послезавтра»", () => {
    expect(r("Что у меня сегодня?")).toEqual([TODAY]);
    expect(r("Что у меня завтра?")).toEqual(["2026-11-12"]);
    expect(r("А послезавтра?")).toEqual(["2026-11-13"]);
    expect(r("Что у меня сегодня и завтра?")).toEqual([TODAY, "2026-11-12"]);
  });

  it("конкретная дата в разных записях", () => {
    expect(r("Что у меня 23 декабря?")).toEqual(["2026-12-23"]);
    expect(r("Пары 16 ноября")).toEqual(["2026-11-16"]);
    expect(r("Что 16.11?")).toEqual(["2026-11-16"]);
    expect(r("Что 16.11.2026?")).toEqual(["2026-11-16"]);
    expect(r("Расписание на 2026-11-17")).toEqual(["2026-11-17"]);
    expect(r("Что у меня 5 ноября?")).toEqual(["2027-11-05"]); // уже прошла: ближайшая будущая
    expect(r("Что у меня 31 февраля?")).toEqual([]); // несуществующая дата
  });

  it("несколько дней в одном вопросе, не больше трёх", () => {
    expect(r("Что в понедельник и во вторник?")).toEqual(["2026-11-16", "2026-11-17"]);
    expect(r("Что в понедельник, вторник, четверг и пятницу?").length).toBe(3);
  });

  it("слово «среда» не путается с «средний», а вопросы про другое не считаются расписанием", () => {
    expect(r("Какой у меня средний балл?")).toEqual([]);
    expect(r("Покажи средний результат")).toEqual([]);
    expect(r("Какой дедлайн в пятницу?")).toEqual([]);
    expect(r("Экзамен в понедельник когда?")).toEqual([]);
    expect(r("Какая погода завтра?")).toEqual([]);
    expect(r("В каком статусе справка к понедельнику?")).toEqual([]);
  });

  it("совсем короткие вопросы про расписание означают сегодня, длинные без даты нет", () => {
    expect(r("Расписание")).toEqual([TODAY]);
    expect(r("Какие у меня пары?")).toEqual([TODAY]);
    expect(r("Когда у меня пара по английскому?")).toEqual([]);
  });

  it("слишком далёкие даты отбрасываются", () => {
    expect(r("Что у меня 2030-01-01?")).toEqual([]);
  });

  it("описание даты: относительное слово, день недели, чётность недели", () => {
    expect(describeDate("2026-11-12", TODAY)).toBe("завтра (четверг, 12 ноября, нижняя неделя)");
    expect(describeDate("2026-11-16", TODAY)).toBe("понедельник, 16 ноября (верхняя неделя)");
    expect(describeDate("2026-11-24", TODAY)).toBe("вторник, 24 ноября (нижняя неделя)");
  });
});

describe("модель получает готовый список пар, посчитанный кодом", () => {
  it("понедельник: две пары студента 2, а не «пар нет» (исходная ошибка)", async () => {
    const calls = spy();
    const s2 = await userOf("student2");
    const r = await askAssistant(s2, "Какие пары в понедельник?", NOW);
    expect(r.ok).toBe(true);
    const ctx = JSON.parse(calls[0].data);
    expect(ctx.scheduleAnswer).toHaveLength(1);
    const text: string = ctx.scheduleAnswer[0].text;
    expect(text).toContain("Пары на понедельник, 16 ноября (верхняя неделя)");
    expect(text).toContain("1) 09:00–10:30 Теория международных отношений, лекция, ауд. 301");
    expect(text).toContain("2) 10:40–12:10 Деловой английский, семинар, ауд. 412");
    expect(text).not.toContain("пар нет");
  });

  it("то же в ответе заглушки: обе пары и ссылка на расписание этого дня", async () => {
    const r = await askAssistant(await userOf("student2"), "Какие пары в понедельник?", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain("Теория международных отношений");
    expect(r.text).toContain("Деловой английский");
    expect(r.text).not.toMatch(/пар нет/);
    expect(r.links.map((l) => l.href)).toEqual(["/schedule?d=2026-11-16&v=day"]);
  });

  it("вторник верхней недели: лекция в 215", async () => {
    const calls = spy();
    await askAssistant(await userOf("student1"), "Что у меня во вторник?", NOW);
    const text: string = JSON.parse(calls[0].data).scheduleAnswer[0].text;
    expect(text).toContain("вторник, 17 ноября (верхняя неделя)");
    expect(text).toContain("Мировая экономика, лекция, ауд. 215");
    expect(text).not.toContain("ауд. 216");
  });

  it("неделя другой чётности: тот же вторник на нижней неделе это семинар в 216", async () => {
    const calls = spy();
    // с 18 ноября (верхняя неделя) ближайший вторник это 24 ноября (нижняя)
    const wednesday = new Date("2026-11-18T09:00:00Z");
    await askAssistant(await userOf("student1"), "Что у меня во вторник?", wednesday);
    const text: string = JSON.parse(calls[0].data).scheduleAnswer[0].text;
    expect(text).toContain("вторник, 24 ноября (нижняя неделя)");
    expect(text).toContain("Мировая экономика, семинар, ауд. 216");
    expect(text).not.toContain("ауд. 215");
    // и то же по явной дате
    const byDate = spy();
    await askAssistant(await userOf("student1"), "Что у меня 24 ноября?", NOW);
    expect(JSON.parse(byDate[0].data).scheduleAnswer[0].text).toContain("семинар, ауд. 216");
  });

  it("«завтра» считается от текущей даты по Москве", async () => {
    const calls = spy();
    await askAssistant(await userOf("student1"), "Что у меня завтра?", NOW);
    const text: string = JSON.parse(calls[0].data).scheduleAnswer[0].text;
    expect(text).toContain("Пары на завтра (четверг, 12 ноября, нижняя неделя)");
    expect(text).toContain("Мировая экономика, лекция, ауд. 215");
    expect(text).toContain("Теория международных отношений, семинар, ауд. 301");
    // 21:30 UTC уже следующие сутки по Москве: «завтра» это пятница
    const late = spy();
    await askAssistant(await userOf("student1"), "Что у меня завтра?", new Date("2026-11-11T21:30:00Z"));
    expect(JSON.parse(late[0].data).scheduleAnswer[0].text).toContain("(пятница, 13 ноября");
  });

  it("день без пар: явное «пар нет», а не «данных нет»", async () => {
    const r = await askAssistant(await userOf("student1"), "Какие пары в воскресенье?", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain("Пары на воскресенье, 15 ноября (нижняя неделя): пар нет.");
    expect(r.text).not.toContain("В данных этого нет");
    const calls = spy();
    await askAssistant(await userOf("student1"), "Какие пары в воскресенье?", NOW);
    expect(JSON.parse(calls[0].data).scheduleAnswer[0].text).toContain("пар нет.");
  });

  it("два дня в одном вопросе: два готовых списка", async () => {
    const calls = spy();
    await askAssistant(await userOf("student1"), "Что у меня в понедельник и во вторник?", NOW);
    const answer = JSON.parse(calls[0].data).scheduleAnswer as { date: string; text: string }[];
    expect(answer.map((a) => a.date)).toEqual(["2026-11-16", "2026-11-17"]);
  });

  it("в контексте для остальных вопросов расписание на 14 дней по датам, пустой день передан явно", async () => {
    const ctx = await getAssistantContext(await userOf("student1"), NOW, "Какой у меня средний балл?");
    expect(ctx.scheduleAnswer).toEqual([]);
    expect(ctx.schedule).toHaveLength(14);
    expect(ctx.schedule[0].date).toBe(TODAY);
    expect(ctx.schedule[13].date).toBe("2026-11-24");
    const monday = ctx.schedule.find((d) => d.date === "2026-11-16")!;
    expect(monday).toMatchObject({ weekday: "Понедельник", week: "верхняя" });
    expect(monday.lessons).toHaveLength(2);
    const sunday = ctx.schedule.find((d) => d.date === "2026-11-15")!;
    expect(sunday.lessons).toEqual([]); // «пар нет», а не отсутствие данных
    expect(ctx.schedule.find((d) => d.date === "2026-11-24")!.week).toBe("нижняя");
  });

  it("перенос и отмена попадают в готовый список", async () => {
    const s1 = await userOf("student1");
    const lessons = await prisma.lesson.findMany({
      where: { group: { name: "МО-231" }, weekday: 1 },
      orderBy: { slot: "asc" },
    });
    const cancel = await prisma.lessonChange.create({
      data: { lessonId: lessons[0].id, date: dayStart("2026-11-16"), kind: "отмена", comment: "Преподаватель на конференции" },
    });
    const move = await prisma.lessonChange.create({
      data: { lessonId: lessons[1].id, date: dayStart("2026-11-16"), kind: "перенос", newSlot: 5, comment: "По просьбе преподавателя" },
    });
    try {
      const calls = spy();
      await askAssistant(s1, "Какие пары в понедельник?", NOW);
      const text: string = JSON.parse(calls[0].data).scheduleAnswer[0].text;
      expect(text).toContain("ОТМЕНЕНА (Преподаватель на конференции)");
      expect(text).toContain("Перенесена на 16:00 (По просьбе преподавателя)");
    } finally {
      await prisma.lessonChange.deleteMany({ where: { id: { in: [cancel.id, move.id] } } });
    }
  });
});

describe("студент А не получает пары студента Б", () => {
  it("в понедельник у групп разные пары, и каждый получает только свои", async () => {
    const callsA = spy();
    await askAssistant(await userOf("student1"), "Какие пары в понедельник?", NOW);
    const a: Captured = callsA[0];
    const callsB = spy();
    await askAssistant(await userOf("student3"), "Какие пары в понедельник?", NOW);
    const b: Captured = callsB[0];

    const answerA: string = JSON.parse(a.data).scheduleAnswer[0].text;
    const answerB: string = JSON.parse(b.data).scheduleAnswer[0].text;
    expect(answerA).toContain("Теория международных отношений");
    expect(answerA).toContain("ауд. 301");
    expect(answerB).toContain("Мировая экономика, лекция, ауд. 210");
    expect(answerB).not.toContain("Теория международных отношений");
    expect(answerA).not.toContain("ауд. 210");

    // аудитории и пары группы Б не встречаются нигде в запросе студента А и наоборот
    for (const room of ["ауд. 210", "ауд. 118", "ауд. 414"]) expect(a.data, room).not.toContain(room);
    for (const room of ["ауд. 301", "ауд. 412", "ауд. 215", "ауд. 216", "ауд. 305"]) expect(b.data, room).not.toContain(room);
    expect(b.data).not.toContain("Теория международных отношений"); // студент 3 на неё не записан
  });

  it("сотрудник не получает расписания (помощник доступен студентам)", async () => {
    const calls = spy();
    const r = await askAssistant(await userOf("staff"), "Какие пары в понедельник?", NOW);
    expect(r).toMatchObject({ ok: false, reason: "forbidden" });
    expect(calls).toHaveLength(0);
  });
});

describe("режим помощника для интерфейса", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["AI_PROVIDER", "AI_API_KEY"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("stub, ai или unavailable: текст о пробной версии нужен только при заглушке", () => {
    process.env.AI_PROVIDER = "stub";
    expect(assistantMode()).toBe("stub");
    process.env.AI_PROVIDER = "amvera";
    process.env.AI_API_KEY = "test-key-not-real-1234567890";
    expect(assistantMode()).toBe("ai");
    process.env.AI_API_KEY = "";
    expect(assistantMode()).toBe("unavailable");
    process.env.AI_PROVIDER = "unknown";
    expect(assistantMode()).toBe("unavailable");
  });
});
