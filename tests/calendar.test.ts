import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { getMyIcs } = await import("@/lib/data/calendar");
const { escapeIcsText, foldLine, mskToUtcStamp, buildIcs } = await import("@/lib/ics");

const NOW = new Date("2026-11-12T09:00:00Z");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}
const unfold = (s: string) => s.replace(/\r\n /g, "");
const events = (ics: string) => unfold(ics).split("BEGIN:VEVENT").slice(1);

describe("экспорт расписания в .ics", () => {
  it("формат: московское время переводится в UTC, текст экранируется, длинные строки режутся", () => {
    expect(mskToUtcStamp("2026-11-16", "09:00")).toBe("20261116T060000Z");
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(escapeIcsText("a\rb\r\nc\u0007")).toBe("a\\nb\\nc");
    const folded =foldLine("SUMMARY:" + "я".repeat(80));
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "я".repeat(80));
    const ics = buildIcs([], NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("студент получает пары своей группы, отменённых нет", async () => {
    const ics = (await getMyIcs(await userOf("student1"), NOW))!;
    const ev = events(ics);
    expect(ev.length).toBeGreaterThan(20);
    expect(ics).toContain("Теория международных отношений");
    expect(ics).toContain("DTSTART:20261116T060000Z"); // понедельник 16 ноября, 09:00 по Москве
    expect(ics).not.toContain("Статистика"); // дисциплина только у другой группы
  });

  it("отменённая пара в файл не попадает", async () => {
    const me = await userOf("student1");
    const before = (await getMyIcs(me, NOW))!;
    // понедельник 16 ноября, первая пара группы студента 1 (верхняя неделя)
    const lesson = await prisma.lesson.findFirstOrThrow({
      where: { weekday: 1, slot: 1, group: { profiles: { some: { userId: me.id } } } },
    });
    const date = new Date("2026-11-23T00:00:00Z"); // так хранятся даты изменений (dayStart): понедельник 23 ноября
    await prisma.lessonChange.deleteMany({ where: { lessonId: lesson.id, date } });
    const ch = await prisma.lessonChange.create({ data: { lessonId: lesson.id, date, kind: "отмена", comment: "тест" } });
    try {
      const after = (await getMyIcs(me, NOW))!;
      expect(events(after).length).toBe(events(before).length - 1);
      expect(unfold(after)).not.toContain(`UID:${lesson.id}-2026-11-23-${me.id}@dekanat.concept`);
      expect(unfold(before)).toContain(`UID:${lesson.id}-2026-11-23-${me.id}@dekanat.concept`);
    } finally {
      await prisma.lessonChange.delete({ where: { id: ch.id } });
    }
  });

  it("студент А не получает пары студента Б: разные группы дают разные события и uid", async () => {
    const a = (await getMyIcs(await userOf("student1"), NOW))!;
    const b = (await getMyIcs(await userOf("student3"), NOW))!;
    expect(b).toContain("Статистика");
    const uids = (s: string) => new Set([...unfold(s).matchAll(/UID:(\S+)/g)].map((m) => m[1]));
    const ua = uids(a);
    for (const id of uids(b)) expect(ua.has(id)).toBe(false);
    // студенты одной группы: события те же, но uid привязаны к пользователю
    const a2 = (await getMyIcs(await userOf("student2"), NOW))!;
    expect(events(a2).length).toBe(events(a).length);
    for (const id of uids(a2)) expect(ua.has(id)).toBe(false);
  });

  it("у сотрудника файла нет", async () => {
    expect(await getMyIcs(await userOf("staff"), NOW)).toBeNull();
  });
});
