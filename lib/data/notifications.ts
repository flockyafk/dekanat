import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

/** Условие «уведомление адресовано мне»: всем, моей группе или лично мне. */
async function addressedToMe(user: CurrentUser): Promise<Prisma.NotificationWhereInput> {
  const p = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { groupId: true } });
  const or: Prisma.NotificationWhereInput[] = [
    { audience: "all" },
    { audience: "student", studentId: user.id },
  ];
  if (p) or.push({ audience: "group", groupId: p.groupId });
  return { OR: or };
}

export async function getMyUnreadCount(user: CurrentUser): Promise<number> {
  return prisma.notification.count({
    where: { AND: [await addressedToMe(user), { reads: { none: { userId: user.id } } }] },
  });
}

/** Лента уведомлений: адресованные мне, новые сверху, с отметкой «прочитано». */
export async function getMyNotifications(user: CurrentUser, limit = 50) {
  const rows = await prisma.notification.findMany({
    where: await addressedToMe(user),
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { reads: { where: { userId: user.id }, select: { userId: true } } },
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: n.reads.length > 0,
  }));
}

/** Отметить прочитанным. Чужое или несуществующее уведомление не отмечается. */
export async function markNotificationRead(user: CurrentUser, notificationId: string): Promise<boolean> {
  const mine = await prisma.notification.findFirst({
    where: { AND: [await addressedToMe(user), { id: notificationId }] },
    select: { id: true },
  });
  if (!mine) return false;
  await recordRead(notificationId, user.id);
  return true;
}

export async function markAllNotificationsRead(user: CurrentUser): Promise<number> {
  const unread = await prisma.notification.findMany({
    where: { AND: [await addressedToMe(user), { reads: { none: { userId: user.id } } }] },
    select: { id: true },
  });
  for (const n of unread) await recordRead(n.id, user.id);
  return unread.length;
}

/** Запись «прочитано». Повторная запись (двойной клик, параллельные запросы) не считается ошибкой. */
async function recordRead(notificationId: string, userId: string) {
  try {
    await prisma.notificationRead.create({ data: { notificationId, userId } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // P2002: такая запись уже есть
  }
}

export async function getMyLatestAnnouncements(user: CurrentUser, limit = 3) {
  return prisma.notification.findMany({
    where: { AND: [await addressedToMe(user), { kind: "объявление" }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, body: true, link: true, createdAt: true },
  });
}
