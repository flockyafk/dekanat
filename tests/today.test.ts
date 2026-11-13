import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { getTodayData } = await import("@/lib/data/today");
const { getMyDeadlines } = await import("@/lib/data/deadlines");
const { getMyLessonsOn } = await import("@/lib/data/schedule");
const { getMyUnreadCount } = await import("@/lib/data/notifications");
const { changeMyPassword } = await import("@/lib/data/profile");
const { dateKey, dayStart, weekParityOf, weekdayOf, addDays } = await import("@/lib/time");

// Среда 12 ноября 2026: дедлайны и экзамены в сиде заданы фиксированными датами, поэтому тесты идут на фиксированный «сегодня»
const NOW = new Date("2026-11-12T09:00:00Z");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

describe("время по Москве", () => {
  it("полночь по Москве наступает в 21:00 UTC", () => {
    expect(dateKey(new Date("2026-11-11T20:59:00Z"))).toBe("2026-11-11");
    expect(dateKey(new Date("2026-11-11T21:00:00Z"))).toBe("2026-11-12");
  });
  it("верхняя и нижняя недели чередуются", () => {
    expect(weekParityOf("2026-11-16")).not.toBe(weekParityOf("2026-11-23"));
    expect(weekdayOf("2026-11-16")).toBe(1); // понедельник
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});

describe("экран «Сегодня»: данные только своего студента", () => {
  it("сводка у студентов разная и считается по своим оценкам", async () => {
    const s1 = await getTodayData(await userOf("student1"));
    const s2 = await getTodayData(await userOf("student2"));
    expect(s1.summary.average).toBe(76);
    expect(s2.summary.average).toBe(63);
    expect(s1.summary.debts).toBe(0);
    expect(s2.summary.debts).toBe(1);
  });

  it("ближайший экзамен и долги на «Сегодня» принадлежат своему студенту", async () => {
    const s1 = await getTodayData(await userOf("student1"), NOW);
    const s2 = await getTodayData(await userOf("student2"), NOW);
    const s3 = await getTodayData(await userOf("student3"), NOW);
    expect(s1.summary.exam?.title).toBe("Деловой английский");
    expect(s2.summary.exam?.title).toBe("Теория международных отношений");
    expect(s3.summary.exam?.title).toBe("Статистика");
    expect(s1.summary.debts).toBe(0); // долг студента 2 не попадает к студенту 1
  });

  it("дедлайны и заявки не попадают к чужому студенту", async () => {
    const s1 = await getTodayData(await userOf("student1"), NOW);
    const s2 = await getTodayData(await userOf("student2"), NOW);
    const s3 = await getTodayData(await userOf("student3"), NOW);
    expect(s1.deadlines.map((d) => d.title)).toContain("Сдать эссе по ТМО");
    expect(s3.deadlines.map((d) => d.title)).not.toContain("Сдать эссе по ТМО");
    expect(s1.deadlines.map((d) => d.title)).not.toContain("Лабораторная 2 по статистике");
    // «Тест по деловому английскому» (18 ноября) это дедлайн ГРУППЫ 1 по дисциплине, на которую записан и студент 3 (группа 2):
    // студент 3 его видеть не должен
    const wide = await getMyDeadlines(await userOf("student3"), NOW, new Date("2026-11-30T00:00:00Z"));
    expect(wide.map((d) => d.title)).toContain("Презентация на английском");
    expect(wide.map((d) => d.title)).not.toContain("Тест по деловому английскому");
    expect(wide.map((d) => d.title)).not.toContain("Реферат по мировой экономике");
    // заявка студента 1 «в работе» видна только ему
    expect(s1.requests.map((r) => r.type)).toContain("Справка об обучении");
    expect(s2.deadlines.map((d) => d.title)).toContain("Сдать эссе по ТМО"); // та же группа, что у студента 1
    expect(s2.deadlines.map((d) => d.title)).not.toContain("Лабораторная 2 по статистике");
    expect(s2.requests).toHaveLength(0);
    expect(s3.requests).toHaveLength(0);
  });

  it("сотрудник получает пустые данные студента", async () => {
    const staff = await getTodayData(await userOf("staff"));
    expect(staff.next).toBeNull();
    expect(staff.deadlines).toHaveLength(0);
    expect(staff.summary.average).toBeNull();
  });
});

describe("расписание и уведомления", () => {
  beforeAll(async () => {
    await prisma.lessonChange.deleteMany(); // демо-переносы сида лежат и на этих датах
  });

  const monday = "2026-11-16";
  const change = { id: "" };
  afterAll(async () => {
    if (change.id) await prisma.lessonChange.delete({ where: { id: change.id } }).catch(() => {});
  });

  it("у групп разные пары, перенос группы 1 не виден группе 2", async () => {
    const s1 = await userOf("student1");
    const s3 = await userOf("student3");
    const before = await getMyLessonsOn(s1, monday);
    expect(before.length).toBeGreaterThan(0);

    const created = await prisma.lessonChange.create({
      data: { lessonId: before[0].id, date: dayStart(monday), kind: "отмена", comment: "тест" },
    });
    change.id = created.id;

    const a = await getMyLessonsOn(s1, monday);
    const c = await getMyLessonsOn(s3, monday);
    expect(a[0].cancelled).toBe(true);
    expect(c.some((l) => l.cancelled)).toBe(false);
    expect(c.map((l) => l.id)).not.toContain(before[0].id);
  });

  it("счётчик непрочитанных учитывает адресацию: всем, группе, лично", async () => {
    expect(await getMyUnreadCount(await userOf("student1"))).toBe(4); // всем + группа 1 (2) + лично
    expect(await getMyUnreadCount(await userOf("student2"))).toBe(3); // всем + группа 1 (2)
    expect(await getMyUnreadCount(await userOf("student3"))).toBe(2); // всем + группа 2
  });
});

describe("смена пароля", () => {
  it("тестовые аккаунты защищены от смены пароля", async () => {
    const r = await changeMyPassword(await userOf("student1"), "demo-student-1", "new-password-1");
    expect(r.ok).toBe(false);
  });

  it("student4 создан сидом, пароль у него менять можно, а при следующем старте он возвращается к демо-значению", async () => {
    const { ensureSpareStudent, SPARE_PASSWORD } = await import("../prisma/refresh-demo");
    const me = await userOf("student4");
    const wrong = await changeMyPassword(me, "wrong", "new-password-1");
    expect(wrong.ok === false && wrong.error).toBe("Текущий пароль указан неверно.");
    const r = await changeMyPassword(me, SPARE_PASSWORD, "new-password-1");
    expect(r.ok).toBe(true);
    await prisma.session.create({ data: { id: "spare-session", userId: me.id, expiresAt: new Date(Date.now() + 60000) } });
    await ensureSpareStudent(prisma);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(await bcrypt.compare(SPARE_PASSWORD, row.passwordHash)).toBe(true);
    expect(await prisma.session.count({ where: { userId: me.id } })).toBe(0);
    await prisma.loginAttempt.deleteMany({ where: { key: `pwd:${me.id}` } });
    // чужие данные не тронуты: пароль student2 прежний
    const s2 = await prisma.user.findUniqueOrThrow({ where: { login: "student2" } });
    expect(await bcrypt.compare("demo-student-2", s2.passwordHash)).toBe(true);
  });

  it("свой пароль меняется, чужой не затрагивается", async () => {
    const u = await prisma.user.upsert({
      where: { login: "tmp-user" },
      update: {},
      create: { login: "tmp-user", passwordHash: await bcrypt.hash("old-password-1", 10), role: "student" },
    });
    const other = await prisma.user.findUniqueOrThrow({ where: { login: "student2" } });
    const me = { id: u.id, login: u.login, role: "student" as const };

    expect((await changeMyPassword(me, "wrong", "new-password-1")).ok).toBe(false);
    // перебор текущего пароля ограничен: после 6 неверных попыток верный пароль тоже отклоняется
    for (let i = 0; i < 6; i++) await changeMyPassword(me, "wrong", "new-password-1");
    expect((await changeMyPassword(me, "old-password-1", "new-password-1")).ok).toBe(false);
    await prisma.loginAttempt.deleteMany({ where: { key: `pwd:${u.id}` } });
    expect((await changeMyPassword(me, "old-password-1", "new-password-1")).ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("new-password-1", after.passwordHash)).toBe(true);
    const otherAfter = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(otherAfter.passwordHash).toBe(other.passwordHash);
    await prisma.user.delete({ where: { id: u.id } });
  });
});
