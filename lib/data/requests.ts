import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { MAX_REQUESTS_PER_DAY, REQUEST_TYPE_VALUES } from "@/lib/constants";
import { withUserLock } from "@/lib/lock";

/** Список заявок текущего студента, новые сверху. */
export async function listMyRequests(user: CurrentUser) {
  return prisma.request.findMany({
    where: { studentId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, status: true, createdAt: true, updatedAt: true },
  });
}

/** Заявка со всей историей. Чужая или несуществующая заявка даёт null (страница отвечает 404). */
export async function getMyRequest(user: CurrentUser, id: string) {
  const request = await prisma.request.findFirst({
    where: { id, studentId: user.id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!request) return null;
  return {
    id: request.id,
    type: request.type,
    text: request.text,
    status: request.status,
    createdAt: request.createdAt,
    events: request.events.map((e) => ({
      id: e.id,
      status: e.status,
      comment: e.comment,
      byMe: e.author === user.login,
      createdAt: e.createdAt,
    })),
  };
}

export type CreateRequestResult = { ok: true; id: string } | { ok: false; error: string };

/** Создание заявки от имени текущего студента. studentId берётся только из сессии. */
export async function createMyRequest(user: CurrentUser, type: string, rawText: string): Promise<CreateRequestResult> {
  if (user.role !== "student") return { ok: false, error: "Заявки подают студенты." };
  if (!REQUEST_TYPE_VALUES.includes(type)) return { ok: false, error: "Выберите вид заявки из списка." };
  // Та же проверка, что в форме: слой данных не полагается только на страницу
  const text = rawText.trim();
  if (text.length < 10 || text.length > 1000) return { ok: false, error: "Текст заявки: от 10 до 1000 символов." };

  return withUserLock(`req:${user.id}`, async (): Promise<CreateRequestResult> => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sent = await prisma.request.count({ where: { studentId: user.id, createdAt: { gt: since } } });
    if (sent >= MAX_REQUESTS_PER_DAY) {
      return { ok: false, error: "Сегодня уже отправлено много заявок. Попробуйте завтра." };
    }
    const request = await prisma.request.create({
      data: {
        studentId: user.id,
        type,
        text,
        status: "Отправлена",
        events: { create: { status: "Отправлена", author: user.login } },
      },
    });
    return { ok: true, id: request.id };
  });
}
