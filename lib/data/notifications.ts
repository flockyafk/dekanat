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

export async function getMyLatestAnnouncements(user: CurrentUser, limit = 3) {
  return prisma.notification.findMany({
    where: { AND: [await addressedToMe(user), { kind: "объявление" }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, body: true, link: true, createdAt: true },
  });
}
