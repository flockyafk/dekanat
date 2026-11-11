import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { STAFF_STATUSES } from "@/lib/constants";

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
