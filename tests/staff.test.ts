import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { listRequestsForStaff, listGroupsForStaff, publishAnnouncement, changeRequestStatus } = await import("@/lib/data/staff");
const { getMyNotifications, getMyLatestAnnouncements } = await import("@/lib/data/notifications");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

const createdNotes: string[] = [];
beforeAll(() => expect(process.env.DATABASE_URL).toContain("test.db"));
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { id: { in: createdNotes } } });
});

describe("кабинет сотрудника: студент не получает доступ", () => {
  it("студент не видит заявки других и не публикует объявления: функции отказывают на сервере", async () => {
    for (const login of ["student1", "student2", "student3"]) {
      const s = await userOf(login);
      await expect(listRequestsForStaff(s)).rejects.toThrow("FORBIDDEN");
      await expect(listGroupsForStaff(s)).rejects.toThrow("FORBIDDEN");
      await expect(publishAnnouncement(s, { audience: "all", title: "Взлом", body: "Я студент" })).rejects.toThrow("FORBIDDEN");
      expect((await changeRequestStatus(s, "any", "Готова")).ok).toBe(false);
    }
    expect(await prisma.notification.count({ where: { title: "Взлом" } })).toBe(0);
  });

  it("сотрудник видит заявки всех студентов с именами и группами", async () => {
    const list = await listRequestsForStaff(await userOf("staff"));
    expect(list.map((r) => r.studentName)).toEqual(expect.arrayContaining(["Иванова Анна Сергеевна", "Петров Максим Олегович"]));
    expect(list.every((r) => r.groupName)).toBe(true);
  });

  it("фильтр по статусу работает, неизвестный статус игнорируется", async () => {
    const staff = await userOf("staff");
    const sent = await listRequestsForStaff(staff, "Отправлена");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((r) => r.status === "Отправлена")).toBe(true);
    const all = await listRequestsForStaff(staff, "что-то левое");
    expect(all.length).toBeGreaterThanOrEqual(sent.length);
  });
});

describe("смена статуса сотрудником", () => {
  it("успешная смена: событие с комментарием, уведомление владельцу со ссылкой, комментарий обрезается до 500 символов", async () => {
    const { createMyRequest } = await import("@/lib/data/requests");
    const staff = await userOf("staff");
    const s3 = await userOf("student3");
    const created = await createMyRequest(s3, "Свободное обращение в деканат", "Прошу разъяснить порядок пересдачи.");
    if (!created.ok) throw new Error("не создана");
    try {
      const res = await changeRequestStatus(staff, created.id, "Отклонена", "я".repeat(600));
      expect(res.ok).toBe(true);
      const events = await prisma.requestEvent.findMany({ where: { requestId: created.id }, orderBy: { createdAt: "asc" } });
      expect(events.map((e) => e.status)).toEqual(["Отправлена", "Отклонена"]);
      expect(events[1].comment).toHaveLength(500);
      expect(events[1].author).toBe("staff");
      const notes = await prisma.notification.findMany({ where: { link: `/requests/${created.id}` } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ audience: "student", studentId: s3.id, kind: "заявка", title: "Заявка: Отклонена" });
      // повтор без комментария: статус уже такой
      expect((await changeRequestStatus(staff, created.id, "Отклонена")).ok).toBe(false);
    } finally {
      await prisma.notification.deleteMany({ where: { link: `/requests/${created.id}` } });
      await prisma.request.delete({ where: { id: created.id } });
    }
  });
});

describe("публикация объявлений", () => {
  it("объявление группе видят только студенты этой группы", async () => {
    const staff = await userOf("staff");
    const g2 = await prisma.group.findFirstOrThrow({ where: { name: "МЭО-232" } });
    const res = await publishAnnouncement(staff, { audience: "group", groupId: g2.id, title: "Только для МЭО-232", body: "Собрание группы в среду." });
    expect(res.ok).toBe(true);
    const note = await prisma.notification.findFirstOrThrow({ where: { title: "Только для МЭО-232" } });
    createdNotes.push(note.id);

    const titles = async (login: string) => (await getMyNotifications(await userOf(login))).map((n) => n.title);
    expect(await titles("student3")).toContain("Только для МЭО-232");
    expect(await titles("student1")).not.toContain("Только для МЭО-232");
    expect(await titles("student2")).not.toContain("Только для МЭО-232");
    const ann3 = (await getMyLatestAnnouncements(await userOf("student3"), 10)).map((a) => a.title);
    expect(ann3).toContain("Только для МЭО-232");
  });

  it("объявление всем видят все студенты", async () => {
    const staff = await userOf("staff");
    expect((await publishAnnouncement(staff, { audience: "all", title: "Для всех студентов", body: "Деканат закрыт в субботу." })).ok).toBe(true);
    const note = await prisma.notification.findFirstOrThrow({ where: { title: "Для всех студентов" } });
    createdNotes.push(note.id);
    for (const login of ["student1", "student2", "student3"]) {
      expect((await getMyNotifications(await userOf(login))).map((n) => n.title)).toContain("Для всех студентов");
    }
  });

  it("неверные данные отклоняются", async () => {
    const staff = await userOf("staff");
    expect((await publishAnnouncement(staff, { audience: "group", groupId: "no-such", title: "Заголовок", body: "Текст" })).ok).toBe(false);
    expect((await publishAnnouncement(staff, { audience: "everyone", title: "Заголовок", body: "Текст" })).ok).toBe(false);
    expect((await publishAnnouncement(staff, { audience: "all", title: "ab", body: "Текст" })).ok).toBe(false);
    expect((await publishAnnouncement(staff, { audience: "all", title: "Заголовок", body: "а".repeat(1001) })).ok).toBe(false);
  });
});
