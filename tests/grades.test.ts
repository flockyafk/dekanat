import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { getMyCourses, getMyCourse, getMySession, getMyStanding } = await import("@/lib/data/grades");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}
const courseId = async (title: string) => (await prisma.course.findFirstOrThrow({ where: { title } })).id;

describe("успеваемость: каждый видит только свои дисциплины и оценки", () => {
  it("списки дисциплин разные", async () => {
    const s1 = (await getMyCourses(await userOf("student1"))).map((c) => c.title);
    const s3 = (await getMyCourses(await userOf("student3"))).map((c) => c.title);
    expect(s1).toContain("Теория международных отношений");
    expect(s1).not.toContain("Статистика");
    expect(s3).toContain("Статистика");
    expect(s3).not.toContain("Теория международных отношений");
  });

  it("в общей дисциплине студент видит только свои оценки", async () => {
    const tmo = await courseId("Теория международных отношений");
    const a = await getMyCourse(await userOf("student1"), tmo);
    const b = await getMyCourse(await userOf("student2"), tmo);
    expect(a!.grades.map((g) => g.score).sort()).toEqual([74, 82]);
    expect(b!.grades.map((g) => g.score)).toEqual([64]);
    expect(a!.average).toBe(78);
    expect(b!.average).toBe(64);
  });

  it("чужая дисциплина и несуществующий id дают null (страница отдаёт 404)", async () => {
    const stat = await courseId("Статистика"); // студент 1 на неё не записан
    expect(await getMyCourse(await userOf("student1"), stat)).toBeNull();
    expect(await getMyCourse(await userOf("student1"), "no-such-course")).toBeNull();
    expect(await getMyCourse(await userOf("staff"), stat)).toBeNull();
  });

  it("посещаемость и экзамены у студентов разные и не смешиваются", async () => {
    const eng = await courseId("Деловой английский");
    const a = await getMyCourse(await userOf("student1"), eng);
    const b = await getMyCourse(await userOf("student2"), eng);
    expect(a!.attendance).toMatchObject({ held: 14, attended: 14, pct: 100 });
    expect(b!.attendance).toMatchObject({ held: 14, attended: 8, pct: 57 });
    expect(a!.exams.map((e) => e.status)).toEqual(["назначено"]);
    expect(b!.exams.map((e) => e.status)).toEqual(["не сдано"]);
  });
});

describe("сессия, долги, зона риска", () => {
  it("долг есть только у студента 2", async () => {
    const s1 = await getMySession(await userOf("student1"));
    const s2 = await getMySession(await userOf("student2"));
    expect(s1.debts).toHaveLength(0);
    expect(s2.debts.map((d) => d.title)).toEqual(["Деловой английский"]);
    expect(s1.upcoming.length).toBeGreaterThan(0);
    expect(s1.upcoming.map((e) => e.title)).not.toContain("Статистика");
  });

  it("зона риска считается по баллу, посещаемости и долгу", async () => {
    const s1 = await getMyStanding(await userOf("student1"));
    const s2 = await getMyStanding(await userOf("student2"));
    const s3 = await getMyStanding(await userOf("student3"));
    // студент 1: Мировая экономика, балл 55 и посещаемость 64%
    expect(s1.atRisk.map((c) => c.title)).toEqual(["Мировая экономика"]);
    expect(s1.atRisk[0].reasons).toEqual(["низкий балл", "много пропусков"]);
    // студент 2: Деловой английский, балл 48, посещаемость 57% и долг
    expect(s2.atRisk.map((c) => c.title)).toEqual(["Деловой английский"]);
    expect(s2.atRisk[0].reasons).toContain("долг");
    expect(s3.atRisk).toHaveLength(0);
    expect([s1.debts, s2.debts, s3.debts]).toEqual([0, 1, 0]);
  });

  it("результаты сессии не смешиваются между студентами", async () => {
    const s1 = await getMySession(await userOf("student1"));
    const s2 = await getMySession(await userOf("student2"));
    const s3 = await getMySession(await userOf("student3"));
    expect(s1.results).toHaveLength(0);
    expect(s2.results.map((r) => r.title)).toEqual(["Деловой английский"]);
    expect(s3.results.map((r) => `${r.title}: ${r.result}`)).toEqual(["Деловой английский: зачтено"]);
    const ids = [s1, s2, s3].flatMap((s) => [...s.upcoming, ...s.results].map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length); // ни одна запись не встречается у двух студентов
  });

  it("у каждого экзамена из сида есть запись студента на дисциплину (ссылки не ведут на 404)", async () => {
    const exams = await prisma.examResult.findMany();
    for (const e of exams) {
      const enr = await prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId: e.studentId, courseId: e.courseId } },
      });
      expect(enr).not.toBeNull();
    }
  });

  it("у сотрудника данных учёбы нет", async () => {
    const staff = await userOf("staff");
    expect(await getMyCourses(staff)).toHaveLength(0);
    const session = await getMySession(staff);
    expect(session.upcoming.length + session.results.length).toBe(0);
    expect((await getMyStanding(staff)).average).toBeNull();
  });
});
