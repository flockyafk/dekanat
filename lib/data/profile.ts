import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

/** Профиль текущего пользователя. Выбор записи только по id из сессии. */
export async function getMyProfile(user: CurrentUser) {
  return prisma.studentProfile.findUnique({
    where: { userId: user.id },
    include: { group: true },
  });
}
