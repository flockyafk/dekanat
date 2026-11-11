import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "file:../data/test.db";

// Подмена cookie-хранилища Next.js
const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (store.has(n) ? { value: store.get(n)! } : undefined),
    set: (n: string, v: string) => void store.set(n, v),
    delete: (n: string) => void store.delete(n),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { login, logout, getCurrentUser, requireStaff, SESSION_COOKIE } = await import("@/lib/auth");
const { prisma } = await import("@/lib/db");
const { getMyProfile } = await import("@/lib/data/profile");

beforeAll(async () => {
  await prisma.loginAttempt.deleteMany();
});
beforeEach(() => store.clear());

describe("вход и выход", () => {
  it("верный пароль создаёт сессию, выход её удаляет", async () => {
    expect(await login("student1", "demo-student-1")).toEqual({ ok: true });
    expect((await getCurrentUser())?.login).toBe("student1");
    await logout();
    expect(await getCurrentUser()).toBeNull();
    expect(store.has(SESSION_COOKIE)).toBe(false);
  });

  it("неверный пароль даёт одинаковую ошибку для чужого и несуществующего логина", async () => {
    const a = await login("student2", "wrong");
    const b = await login("nobody", "wrong");
    expect(a).toEqual(b);
    expect(a.ok).toBe(false);
    expect(await getCurrentUser()).toBeNull();
  });

  it("после 5 неверных попыток вход блокируется даже с верным паролем", async () => {
    for (let i = 0; i < 5; i++) await login("student3", "bad");
    const r = await login("student3", "demo-student-3");
    expect(r.ok).toBe(false);
    await prisma.loginAttempt.deleteMany();
  });

  it("в базе хранится хэш, а не пароль", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { login: "student1" } });
    expect(u.passwordHash).not.toContain("demo-student-1");
    expect(u.passwordHash.startsWith("$2")).toBe(true);
  });
});

describe("доступ", () => {
  it("студент не открывает раздел сотрудника", async () => {
    await login("student1", "demo-student-1");
    await expect(requireStaff()).rejects.toThrow("NOT_FOUND");
  });

  it("сотрудник проходит проверку роли", async () => {
    await login("staff", "demo-staff-1");
    expect((await requireStaff()).role).toBe("staff");
  });

  it("студент А видит только свой профиль, не профиль студента Б", async () => {
    await login("student1", "demo-student-1");
    const me = (await getCurrentUser())!;
    const profile = await getMyProfile(me);
    expect(profile?.fullName).toBe("Иванова Анна Сергеевна");
    expect(profile?.fullName).not.toContain("Петров");
  });
});
