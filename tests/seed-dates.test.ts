import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { refreshDemoDates, DEMO_DEADLINES } = await import("../prisma/refresh-demo");
const { getMyDeadlines } = await import("@/lib/data/deadlines");
const { addDays } = await import("@/lib/time");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

async function snapshot() {
  const deadlines = (await prisma.deadline.findMany({ include: { group: true } }))
    .map((d) => `${d.group?.name} | ${d.title} | ${d.dueAt.toISOString()}`)
    .sort();
  const changes = (await prisma.lessonChange.findMany())
    .map((c) => `${c.lessonId} | ${c.date.toISOString()} | ${c.kind} | ${c.newRoom} | ${c.newSlot}`)
    .sort();
  return { deadlines, changes };
}

beforeAll(() => expect(process.env.DATABASE_URL).toContain("test.db"));
afterAll(() => vi.useRealTimers());

describe("даты демо-данных фиксированные и не зависят от дня запуска", () => {
  it("после пересоздания в любой день дедлайны и переносы те же (раньше плыли от дня запуска контейнера)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T08:00:00Z"));
    await refreshDemoDates(prisma);
    const first = await snapshot();

    vi.setSystemTime(new Date("2026-11-25T20:00:00Z"));
    await refreshDemoDates(prisma);
    const second = await snapshot();

    vi.setSystemTime(new Date("2026-12-20T08:00:00Z"));
    await refreshDemoDates(prisma);
    const third = await snapshot();
    vi.useRealTimers();

    expect(first.deadlines.length).toBe(DEMO_DEADLINES.length);
    expect(second.deadlines).toEqual(first.deadlines);
    expect(third.deadlines).toEqual(first.deadlines);
    expect(second.changes).toEqual(first.changes);
    expect(first.changes.length).toBeGreaterThan(40); // изменения на каждый будний день окна у обеих групп
  });

  it("сроки заданы календарными датами 18:00 по Москве", () => {
    const essay = DEMO_DEADLINES.find((d) => d.title === "Сдать эссе по ТМО")!;
    expect(essay.date).toBe("2026-11-14");
  });
});

describe("с 12 ноября по 4 декабря (в том числе 21-28 ноября) у каждого студента всегда есть будущий дедлайн", () => {
  it("в каждый день окна (12:00 по Москве) в ближайшие 7 дней есть срок у обеих групп и у каждого студента", async () => {
    await refreshDemoDates(prisma);
    for (const login of ["student1", "student2", "student3"]) {
      const user = await userOf(login);
      for (let day = "2026-11-12"; day <= "2026-12-04"; day = addDays(day, 1)) {
        const now = new Date(`${day}T09:00:00Z`); // 12:00 по Москве
        const list = await getMyDeadlines(user, now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
        expect(list.length, `${login} на ${day}: нет дедлайнов в ближайшие 7 дней`).toBeGreaterThan(0);
        expect(list.every((d) => d.dueAt.getTime() >= now.getTime()), `${login} на ${day}: дедлайн в прошлом`).toBe(true);
      }
    }
  });

  it("дедлайны группы не видны студентам другой группы, даже если они записаны на ту же дисциплину", async () => {
    const wide = (login: string) => userOf(login).then((u) => getMyDeadlines(u, new Date("2026-11-12T00:00:00Z"), new Date("2026-12-31T00:00:00Z")));
    const g1 = (await wide("student1")).map((d) => d.title);
    const g1b = (await wide("student2")).map((d) => d.title);
    const g2 = (await wide("student3")).map((d) => d.title);
    expect(g1).toEqual(g1b); // одна группа, одни дедлайны
    for (const spec of DEMO_DEADLINES) {
      expect(g1.includes(spec.title), `${spec.title} у группы 1`).toBe(spec.group === "МО-231");
      expect(g2.includes(spec.title), `${spec.title} у группы 2`).toBe(spec.group === "МЭО-232");
    }
    expect(new Set(DEMO_DEADLINES.map((d) => d.title)).size).toBe(DEMO_DEADLINES.length); // названия разные
  });

  it("на каждый будний день окна есть изменение расписания, в выходные нет", async () => {
    await refreshDemoDates(prisma);
    const changes = await prisma.lessonChange.findMany({ include: { lesson: true } });
    const byDay = new Map<string, number>();
    for (const c of changes) {
      const key = c.date.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    for (let day = "2026-11-09"; day <= "2026-12-13"; day = addDays(day, 1)) {
      const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
      if (wd === 0 || wd === 6) expect(byDay.get(day) ?? 0, `${day} выходной`).toBe(0);
      else expect(byDay.get(day) ?? 0, `${day} будний день без изменений`).toBeGreaterThanOrEqual(1);
    }
  });
});
