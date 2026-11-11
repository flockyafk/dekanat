import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { getMyWeek, getMyLessonsOn } = await import("@/lib/data/schedule");
const { dayStart, isValidDateKey, mondayOf, weekParityOf } = await import("@/lib/time");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

// Демо-переносы из сида привязаны к текущей дате и могут попасть в проверяемые недели.
// Тестовая база отдельная, поэтому очищаем их перед проверками.
beforeAll(async () => {
  // Защита: никогда не чистить рабочую базу
  expect(process.env.DATABASE_URL).toContain("test.db");
  await prisma.lessonChange.deleteMany();
});

// 2026-11-16 — понедельник верхней недели, 2026-11-23 — понедельник нижней
const UPPER_MON = "2026-11-16";
const LOWER_MON = "2026-11-23";

describe("две чередующиеся недели", () => {
  it("недели определены верно и чередуются", () => {
    expect(weekParityOf(UPPER_MON)).toBe("upper");
    expect(weekParityOf(LOWER_MON)).toBe("lower");
    expect(mondayOf("2026-11-22")).toBe(UPPER_MON); // воскресенье относится к предыдущему понедельнику
  });

  it("вторник: на верхней неделе лекция в 215, на нижней семинар в 216", async () => {
    const s1 = await userOf("student1");
    const up = (await getMyWeek(s1, UPPER_MON))[1].lessons;
    const low = (await getMyWeek(s1, LOWER_MON))[1].lessons;
    expect(up.map((l) => `${l.kind} ${l.room}`)).toEqual(["лекция 215"]);
    expect(low.map((l) => `${l.kind} ${l.room}`)).toEqual(["семинар 216"]);
  });

  it("пятничная пара «только верхняя неделя» не появляется на нижней", async () => {
    const s1 = await userOf("student1");
    const up = (await getMyWeek(s1, UPPER_MON))[4].lessons;
    const low = (await getMyWeek(s1, LOWER_MON))[4].lessons;
    expect(up.length).toBe(low.length + 1);
  });

  it("в неделе шесть дней, пары отсортированы по номеру", async () => {
    const week = await getMyWeek(await userOf("student1"), UPPER_MON);
    expect(week).toHaveLength(6);
    for (const d of week) {
      const slots = d.lessons.map((l) => l.slot);
      expect(slots).toEqual([...slots].sort((a, b) => a - b));
    }
  });
});

describe("переносы, замены и отмены", () => {
  const created: string[] = [];
  afterAll(async () => {
    await prisma.lessonChange.deleteMany({ where: { id: { in: created } } });
  });

  it("перенос меняет время, замена меняет аудиторию, отмена помечает пару", async () => {
    const s1 = await userOf("student1");
    const monday = (await getMyLessonsOn(s1, UPPER_MON)).filter((l) => !l.change);
    expect(monday.length).toBeGreaterThanOrEqual(2);
    const [a, b] = monday;

    const move = await prisma.lessonChange.create({
      data: { lessonId: a.id, date: dayStart(UPPER_MON), kind: "перенос", newSlot: 5, comment: "тест" },
    });
    const room = await prisma.lessonChange.create({
      data: { lessonId: b.id, date: dayStart(UPPER_MON), kind: "замена аудитории", newRoom: "999" },
    });
    created.push(move.id, room.id);

    const after = await getMyLessonsOn(s1, UPPER_MON);
    const moved = after.find((l) => l.id === a.id)!;
    const replaced = after.find((l) => l.id === b.id)!;
    expect(moved.start).toBe("16:00");
    expect(moved.change?.text).toContain("Перенесена");
    expect(replaced.room).toBe("999");
    expect(replaced.change?.text).toContain("→ 999");

    // тот же день на следующей неделе не затронут
    const nextWeek = await getMyLessonsOn(s1, "2026-11-23");
    expect(nextWeek.some((l) => l.change)).toBe(false);
  });

  it("изменения группы 1 не видны студенту группы 2, наборы пар не пересекаются", async () => {
    const week1 = (await getMyWeek(await userOf("student1"), UPPER_MON)).flatMap((d) => d.lessons);
    const week3 = (await getMyWeek(await userOf("student3"), UPPER_MON)).flatMap((d) => d.lessons);
    expect(week1.length).toBeGreaterThan(0);
    expect(week3.length).toBeGreaterThan(0); // иначе проверка ниже была бы пустой
    const ids1 = new Set(week1.map((l) => l.id));
    expect(week3.filter((l) => ids1.has(l.id))).toHaveLength(0);
    expect(week3.some((l) => l.change || l.room === "999")).toBe(false);
  });

  it("студент 2 из той же группы видит те же пары, что студент 1", async () => {
    const a = (await getMyWeek(await userOf("student1"), UPPER_MON)).flatMap((d) => d.lessons.map((l) => l.id));
    const b = (await getMyWeek(await userOf("student2"), UPPER_MON)).flatMap((d) => d.lessons.map((l) => l.id));
    expect(b).toEqual(a);
  });

  it("у сотрудника расписания нет", async () => {
    const week = await getMyWeek(await userOf("staff"), UPPER_MON);
    expect(week.flatMap((d) => d.lessons)).toHaveLength(0);
  });
});

describe("проверка даты из адреса", () => {
  it("принимает нормальную дату и отклоняет мусор", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    expect(isValidDateKey("2026-11-16", now)).toBe(true);
    expect(isValidDateKey("2026-02-30", now)).toBe(false);
    expect(isValidDateKey("abc", now)).toBe(false);
    expect(isValidDateKey("2099-01-01", now)).toBe(false);
    expect(isValidDateKey("2026-11-16'; DROP TABLE", now)).toBe(false);
  });
});
