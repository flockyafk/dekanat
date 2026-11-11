import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "dekanat_session";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Заглушка-хэш: сравниваем с ней, когда логина нет, чтобы время ответа не выдавало существование логина.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-not-used", 10);

const sessionDays = () => Number(process.env.SESSION_DAYS) || 14;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type CurrentUser = { id: string; login: string; role: "student" | "staff" };

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(loginRaw: string, password: string): Promise<LoginResult> {
  const key = loginRaw.trim().toLowerCase();

  if (key.length > 64) return { ok: false, error: "Неверный логин или пароль." };

  // Попытку записываем ДО проверки пароля, чтобы параллельные запросы не обходили лимит.
  // При успешном входе записи стираются.
  const since = new Date(Date.now() - WINDOW_MS);
  await prisma.loginAttempt.create({ data: { key } });
  const attempts = await prisma.loginAttempt.count({ where: { key, createdAt: { gt: since } } });
  if (attempts > MAX_ATTEMPTS) {
    return { ok: false, error: "Слишком много попыток. Подождите 15 минут." };
  }

  const user = await prisma.user.findUnique({ where: { login: key } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    // Старые записи удаляем, чтобы таблица не росла
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: since } } });
    return { ok: false, error: "Неверный логин или пароль." };
  }

  await prisma.loginAttempt.deleteMany({ where: { key } });
  await createSession(user.id);
  return { ok: true };
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionDays() * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  // Подчищаем просроченные сессии
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { id, login, role } = session.user;
  return { id, login, role: role === "staff" ? "staff" : "student" };
}

/** Для страниц и функций с данными: без входа отправляет на /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Раздел сотрудника: студенту отдаём 404, как будто раздела нет. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "staff") notFound();
  return user;
}
