import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

/** Профиль текущего пользователя. Выбор записи только по id из сессии. */
export async function getMyProfile(user: CurrentUser) {
  return prisma.studentProfile.findUnique({
    where: { userId: user.id },
    include: { group: true },
  });
}

// Тестовые аккаунты открыты в README и на /about. Если бы любой посетитель мог сменить их
// пароль, жюри не смогло бы войти. Поэтому для них смена пароля выключена
// (включается переменной DEMO_LOCK=0).
const DEMO_LOGINS = new Set(["student1", "student2", "student3", "staff"]);

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/** Смена пароля текущего пользователя. Меняется только запись из сессии. */
export async function changeMyPassword(
  user: CurrentUser,
  currentPassword: string,
  newPassword: string,
  keepSessionId?: string,
): Promise<ChangePasswordResult> {
  if (DEMO_LOGINS.has(user.login) && process.env.DEMO_LOCK !== "0") {
    return { ok: false, error: "В демо-версии пароль тестовых аккаунтов менять нельзя." };
  }
  // Лимит попыток угадать текущий пароль (на случай украденной сессии), тот же механизм, что при входе
  const key = `pwd:${user.id}`;
  const since = new Date(Date.now() - 15 * 60 * 1000);
  await prisma.loginAttempt.create({ data: { key } });
  if ((await prisma.loginAttempt.count({ where: { key, createdAt: { gt: since } } })) > 5) {
    return { ok: false, error: "Слишком много попыток. Подождите 15 минут." };
  }
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash))) {
    return { ok: false, error: "Текущий пароль указан неверно." };
  }
  await prisma.loginAttempt.deleteMany({ where: { key } });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  // Остальные сессии пользователя закрываем, текущую оставляем
  await prisma.session.deleteMany({
    where: { userId: user.id, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
  });
  return { ok: true };
}
