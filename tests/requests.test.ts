import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

const { prisma } = await import("@/lib/db");
const { createMyRequest, getMyRequest, listMyRequests } = await import("@/lib/data/requests");
const { changeRequestStatus } = await import("@/lib/data/staff");
const { getMyNotifications, getMyUnreadCount, markAllNotificationsRead, markNotificationRead } = await import(
  "@/lib/data/notifications"
);
const { isKnownRoute } = await import("@/lib/routes");

async function userOf(login: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { login } });
  return { id: u.id, login: u.login, role: u.role as "student" | "staff" };
}

const createdIds: string[] = [];
beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("test.db");
});
afterAll(async () => {
  // Возвращаем тестовую базу в исходное состояние, чтобы другие файлы тестов не зависели от этого
  await prisma.notification.deleteMany({ where: { OR: createdIds.map((id) => ({ link: `/requests/${id}` })) } });
  await prisma.request.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.notificationRead.deleteMany();
});

/** Заявка из сида (студент 1, «в работе»), а не самая новая. */
async function seededRequestOf(login: string) {
  const u = await userOf(login);
  return prisma.request.findFirstOrThrow({ where: { studentId: u.id }, orderBy: { createdAt: "asc" } });
}

describe("заявки: каждый видит и меняет только свои", () => {
  it("список заявок у студентов разный (идёт первым, пока тесты не создали новых)", async () => {
    const s1 = (await listMyRequests(await userOf("student1"))).map((r) => r.type);
    const s2 = (await listMyRequests(await userOf("student2"))).map((r) => r.type);
    const s3 = await listMyRequests(await userOf("student3"));
    expect(s1).toEqual(["Справка об обучении"]);
    expect(s2).toEqual(["Заявление на пересдачу"]);
    expect(s3).toHaveLength(0);
  });

  it("чужая и несуществующая заявка дают null (страница отдаёт 404)", async () => {
    const s1 = await userOf("student1");
    const s2 = await userOf("student2");
    const mine = await seededRequestOf("student1");
    const theirs = await seededRequestOf("student2");
    expect(await getMyRequest(s1, mine.id)).not.toBeNull();
    expect(await getMyRequest(s1, theirs.id)).toBeNull();
    expect(await getMyRequest(s2, mine.id)).toBeNull();
    expect(await getMyRequest(s1, "no-such-id")).toBeNull();
  });

  it("новая заявка создаётся со статусом «Отправлена» и историей, на имя студента из сессии", async () => {
    const s1 = await userOf("student1");
    const res = await createMyRequest(s1, "Справка для военкомата", "Нужна справка в военкомат до конца месяца.");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    createdIds.push(res.id);
    const r = await getMyRequest(s1, res.id);
    expect(r?.status).toBe("Отправлена");
    expect(r?.events.map((e) => e.status)).toEqual(["Отправлена"]);
    expect(r?.events[0].byMe).toBe(true);
    // у студента 2 такой заявки нет
    expect(await getMyRequest(await userOf("student2"), res.id)).toBeNull();
  });

  it("неизвестный вид заявки и заявка от сотрудника отклоняются", async () => {
    expect((await createMyRequest(await userOf("student1"), "Что-то левое", "Достаточно длинный текст.")).ok).toBe(false);
    expect((await createMyRequest(await userOf("staff"), "Справка об обучении", "Достаточно длинный текст.")).ok).toBe(false);
  });

  it("параллельная подача заявок не обходит суточный лимит", async () => {
    const s2 = await userOf("student2");
    const before = await prisma.request.count({ where: { studentId: s2.id } });
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => createMyRequest(s2, "Свободное обращение в деканат", `Параллельное обращение номер ${i}.`)),
    );
    for (const r of results) if (r.ok) createdIds.push(r.id);
    const accepted = results.filter((r) => r.ok).length;
    expect(accepted).toBe(10 - before); // у студента 2 в сиде одна заявка, итого ровно 10 за сутки
    expect(await prisma.request.count({ where: { studentId: s2.id } })).toBe(10);
  });

  it("слой данных сам проверяет длину текста", async () => {
    const s1 = await userOf("student1");
    expect((await createMyRequest(s1, "Справка об обучении", "коротко")).ok).toBe(false);
    expect((await createMyRequest(s1, "Справка об обучении", "а".repeat(1001))).ok).toBe(false);
  });

  it("суточный лимит заявок работает", async () => {
    const s3 = await userOf("student3");
    for (let i = 0; i < 10; i++) {
      const r = await createMyRequest(s3, "Свободное обращение в деканат", `Тестовое обращение номер ${i}.`);
      if (r.ok) createdIds.push(r.id);
    }
    const over = await createMyRequest(s3, "Свободное обращение в деканат", "Это уже одиннадцатая заявка.");
    expect(over.ok).toBe(false);
  });
});

describe("сотрудник меняет статус, студент получает уведомление", () => {
  it("студент не может менять статус", async () => {
    const s1 = await userOf("student1");
    const mine = await seededRequestOf("student1");
    expect((await changeRequestStatus(s1, mine.id, "Готова")).ok).toBe(false);
    expect((await getMyRequest(s1, mine.id))?.status).toBe("В работе");
  });

  it("смена статуса пишет историю с комментарием и создаёт уведомление только этому студенту", async () => {
    const staff = await userOf("staff");
    const s1 = await userOf("student1");
    const s2 = await userOf("student2");
    const res = await createMyRequest(s1, "Справка об обучении", "Нужна справка для визового центра.");
    if (!res.ok) throw new Error("не создана");
    createdIds.push(res.id);

    const before1 = await getMyUnreadCount(s1);
    const before2 = await getMyUnreadCount(s2);
    const done = await changeRequestStatus(staff, res.id, "Готова", "Можно забрать в кабинете 101.");
    expect(done.ok).toBe(true);

    const r = await getMyRequest(s1, res.id);
    expect(r?.status).toBe("Готова");
    expect(r?.events.map((e) => e.status)).toEqual(["Отправлена", "Готова"]);
    expect(r?.events[1]).toMatchObject({ comment: "Можно забрать в кабинете 101.", byMe: false });

    expect(await getMyUnreadCount(s1)).toBe(before1 + 1);
    expect(await getMyUnreadCount(s2)).toBe(before2); // студент 2 ничего не получил
    const note = (await getMyNotifications(s1))[0];
    expect(note).toMatchObject({ kind: "заявка", title: "Заявка: Готова", link: `/requests/${res.id}` });
    expect((await getMyNotifications(s2)).some((n) => n.link === `/requests/${res.id}`)).toBe(false);
  });

  it("одновременная смена статуса двумя сотрудниками даёт одно событие и одно уведомление", async () => {
    const staff = await userOf("staff");
    const s1 = await userOf("student1");
    const res = await createMyRequest(s1, "Справка об обучении", "Нужна справка для общежития.");
    if (!res.ok) throw new Error("не создана (лимит?)");
    createdIds.push(res.id);
    const results = await Promise.all([
      changeRequestStatus(staff, res.id, "Готова", "первый"),
      changeRequestStatus(staff, res.id, "Готова", "второй"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.requestEvent.count({ where: { requestId: res.id, status: "Готова" } })).toBe(1);
    expect(await prisma.notification.count({ where: { link: `/requests/${res.id}` } })).toBe(1);
  });

  it("недопустимый статус отклоняется", async () => {
    const staff = await userOf("staff");
    const mine = await seededRequestOf("student1");
    expect((await changeRequestStatus(staff, mine.id, "Отправлена")).ok).toBe(false);
    expect((await changeRequestStatus(staff, mine.id, "что угодно")).ok).toBe(false);
    expect((await changeRequestStatus(staff, "no-such-id", "Готова")).ok).toBe(false);
  });
});

describe("уведомления: адресация и отметка «прочитано»", () => {
  it("лента содержит только адресованное мне", async () => {
    const titles = async (login: string) => (await getMyNotifications(await userOf(login))).map((n) => n.title);
    expect(await titles("student1")).toContain("Эссе по ТМО");
    expect(await titles("student1")).not.toContain("Лабораторная 2 по статистике");
    expect(await titles("student3")).toContain("Лабораторная 2 по статистике");
    expect(await titles("student3")).not.toContain("Заявка в работе"); // личное студента 1
    expect(await titles("student2")).not.toContain("Заявка в работе");
  });

  it("чужое уведомление нельзя отметить прочитанным, своё можно", async () => {
    const s1 = await userOf("student1");
    const s3 = await userOf("student3");
    const personal = (await getMyNotifications(s1)).find((n) => n.title === "Заявка в работе")!;
    expect(await markNotificationRead(s3, personal.id)).toBe(false);
    expect(await prisma.notificationRead.count({ where: { notificationId: personal.id } })).toBe(0);

    const before = await getMyUnreadCount(s1);
    expect(await markNotificationRead(s1, personal.id)).toBe(true);
    expect(await markNotificationRead(s1, personal.id)).toBe(true); // повтор безопасен
    expect(await getMyUnreadCount(s1)).toBe(before - 1);
    expect((await getMyNotifications(s1)).find((n) => n.id === personal.id)?.read).toBe(true);
    // у студента 3 отметка студента 1 ничего не меняет
    expect((await getMyNotifications(s3)).every((n) => n.id !== personal.id)).toBe(true);
  });

  it("«прочитать всё» меняет только мои уведомления", async () => {
    const s2 = await userOf("student2");
    const s3 = await userOf("student3");
    const others = await getMyUnreadCount(s3);
    await markAllNotificationsRead(s2);
    expect(await getMyUnreadCount(s2)).toBe(0);
    expect(await getMyUnreadCount(s3)).toBe(others);
  });
});

describe("ссылки проверяются по списку маршрутов", () => {
  it("известные маршруты проходят, внешние и опасные нет", () => {
    for (const ok of ["/", "/schedule?d=2026-11-16", "/grades", "/grades/abc123", "/requests/xyz_1", "/requests/new?type=a"]) {
      expect(isKnownRoute(ok)).toBe(true);
    }
    for (const bad of [
      "https://evil.example/x",
      "//evil.example",
      "javascript:alert(1)",
      "/staff/../secret",
      "/unknown",
      "/requests/a/b",
      "",
      null,
      undefined,
    ]) {
      expect(isKnownRoute(bad as string | null | undefined)).toBe(false);
    }
  });
});
