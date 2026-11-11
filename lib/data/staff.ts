import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { STAFF_FILTER_STATUSES, STAFF_STATUSES } from "@/lib/constants";

/** Защита в глубину: каждая функция сотрудника сама проверяет роль, а не полагается на страницу. */
function assertStaff(user: CurrentUser) {
  if (user.role !== "staff") throw new Error("FORBIDDEN");
}

/** Заявки всех студентов для сотрудника, новые сверху. Фильтр по статусу необязателен. */
export async function listRequestsForStaff(user: CurrentUser, status?: string) {
  assertStaff(user);
  const rows = await prisma.request.findMany({
    where: status && (STAFF_FILTER_STATUSES as readonly string[]).includes(status) ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: { select: { profile: { select: { fullName: true, group: { select: { name: true } } } } } },
      events: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    text: r.text,
    status: r.status,
    createdAt: r.createdAt,
    studentName: r.student.profile?.fullName ?? "Без профиля",
    groupName: r.student.profile?.group.name ?? "",
    lastComment: r.events[0]?.comment ?? null,
  }));
}

export async function listGroupsForStaff(user: CurrentUser) {
  assertStaff(user);
  return prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export type PublishResult = { ok: true } | { ok: false; error: string };

/** Публикация объявления всем или одной группе. Текст объявления для остальных функций это данные, не команды. */
export async function publishAnnouncement(
  user: CurrentUser,
  input: { audience: string; groupId?: string; title: string; body: string },
): Promise<PublishResult> {
  assertStaff(user);
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3 || title.length > 100) return { ok: false, error: "Заголовок: от 3 до 100 символов." };
  if (body.length < 3 || body.length > 1000) return { ok: false, error: "Текст: от 3 до 1000 символов." };

  if (input.audience === "group") {
    const group = input.groupId ? await prisma.group.findUnique({ where: { id: input.groupId } }) : null;
    if (!group) return { ok: false, error: "Выберите группу." };
    await prisma.notification.create({
      data: { audience: "group", groupId: group.id, kind: "объявление", title, body },
    });
    return { ok: true };
  }
  if (input.audience !== "all") return { ok: false, error: "Выберите, кому показать объявление." };
  await prisma.notification.create({ data: { audience: "all", kind: "объявление", title, body } });
  return { ok: true };
}

export type ChangeStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Смена статуса заявки сотрудником. Роль проверяется здесь, на сервере, независимо от страницы.
 * Студент получает уведомление со ссылкой на заявку.
 */
export async function changeRequestStatus(
  user: CurrentUser,
  requestId: string,
  status: string,
  comment?: string,
): Promise<ChangeStatusResult> {
  if (user.role !== "staff") return { ok: false, error: "Недостаточно прав." };
  if (!(STAFF_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Неверный статус." };
  const note = comment?.trim() ? comment.trim().slice(0, 500) : null;

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "Заявка не найдена." };
  if (request.status === status && !note) return { ok: false, error: "Статус уже такой." };

  // Атомарно: статус меняется, только если он не изменился с момента чтения.
  // Два сотрудника одновременно не создадут дубль события и уведомления.
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.request.updateMany({
      where: { id: requestId, status: request.status },
      data: { status },
    });
    if (updated.count === 0) return false;
    await tx.requestEvent.create({ data: { requestId, status, comment: note, author: user.login } });
    await tx.notification.create({
      data: {
        audience: "student",
        studentId: request.studentId,
        kind: "заявка",
        title: `Заявка: ${status}`,
        body: note ? `${request.type}. Комментарий деканата: ${note}` : request.type,
        link: `/requests/${requestId}`,
      },
    });
    return true;
  });
  if (!changed) return { ok: false, error: "Заявку уже изменили. Обновите страницу." };
  return { ok: true };
}
