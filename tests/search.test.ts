import { afterAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { searchMine } = await import("@/lib/data/search");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

const created: { requests: string[]; notifications: string[] } = { requests: [], notifications: [] };

afterAll(async () => {
  await prisma.request.deleteMany({ where: { id: { in: created.requests } } });
  await prisma.notification.deleteMany({ where: { id: { in: created.notifications } } });
});

describe("поиск по своим данным", () => {
  it("находит дисциплину и пары своей группы, регистр и «ё» не важны", async () => {
    const r = await searchMine(await userOf("student1"), "ТЕОРИЯ междунАродных");
    expect(r.courses.map((c) => c.title)).toContain("Теория международных отношений");
    expect(r.lessons.length).toBeGreaterThan(0);
    expect(r.courses[0].href).toMatch(/^\/grades\/[\w-]+$/);
    const byTeacher = await searchMine(await userOf("student1"), "громов");
    expect(byTeacher.courses.length + byTeacher.lessons.length).toBeGreaterThan(0);
  });

  it("студент А не находит дисциплины, оценки и пары студента Б", async () => {
    // «Статистика» есть только у группы МЭО-232 (student3)
    const s3 = await searchMine(await userOf("student3"), "статистика");
    expect(s3.courses.length).toBe(1);
    expect(s3.lessons.length).toBeGreaterThan(0);
    expect(s3.grades.length).toBeGreaterThan(0); // лабораторная по статистике у student3
    const s1 = await searchMine(await userOf("student1"), "статистика");
    expect(s1.total).toBe(0);
    // у student3 нет дисциплины «Теория международных отношений»
    expect((await searchMine(await userOf("student3"), "теория международных")).total).toBe(0);
  });

  it("чужие заявки не находятся: слово из заявки студента 2 видит только он", async () => {
    const s2 = await userOf("student2");
    const req = await prisma.request.create({
      data: { studentId: s2.id, type: "Свободное обращение в деканат", text: "Прошу рассмотреть вопрос про зимородка" },
    });
    created.requests.push(req.id);
    expect((await searchMine(s2, "зимородк")).requests.map((x) => x.id)).toEqual([req.id]);
    expect((await searchMine(await userOf("student1"), "зимородк")).total).toBe(0);
    expect((await searchMine(await userOf("student3"), "зимородк")).total).toBe(0);
  });

  it("личное уведомление и объявление чужой группы не находятся", async () => {
    const s3 = await userOf("student3");
    const group2 = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: s3.id } });
    const personal = await prisma.notification.create({
      data: { audience: "student", studentId: s3.id, kind: "объявление", title: "Личное про квазар", body: "текст" },
    });
    const groupOnly = await prisma.notification.create({
      data: { audience: "group", groupId: group2.groupId, kind: "объявление", title: "Группе про пульсар", body: "текст" },
    });
    created.notifications.push(personal.id, groupOnly.id);
    expect((await searchMine(s3, "квазар")).announcements.length).toBe(1);
    expect((await searchMine(s3, "пульсар")).announcements.length).toBe(1);
    expect((await searchMine(await userOf("student1"), "квазар")).total).toBe(0);
    expect((await searchMine(await userOf("student1"), "пульсар")).total).toBe(0);
    expect((await searchMine(await userOf("student2"), "пульсар")).total).toBe(0);
  });

  it("слишком короткий и слишком длинный запрос, сотрудник: пусто", async () => {
    expect((await searchMine(await userOf("student1"), "т")).total).toBe(0);
    expect((await searchMine(await userOf("student1"), " ")).total).toBe(0);
    expect((await searchMine(await userOf("student1"), "т".repeat(61))).total).toBe(0);
    expect((await searchMine(await userOf("staff"), "теория")).total).toBe(0);
  });
});
