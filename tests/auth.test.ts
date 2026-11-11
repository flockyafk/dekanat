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

  it("параллельный перебор пароля не обходит лимит попыток", async () => {
    await prisma.loginAttempt.deleteMany();
    // 20 одновременных попыток, одна из них с верным паролем
    const results = await Promise.all([
      ...Array.from({ length: 19 }, () => login("student2", "bad")),
      login("student2", "demo-student-2"),
    ]);
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(1);
    // после лимита верный пароль тоже отклоняется
    expect((await login("student2", "demo-student-2")).ok).toBe(false);
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

  it("студент А и студент Б видят каждый только свой профиль", async () => {
    await login("student1", "demo-student-1");
    const a = (await getCurrentUser())!;
    const profileA = await getMyProfile(a);
    store.clear();
    await login("student2", "demo-student-2");
    const b = (await getCurrentUser())!;
    const profileB = await getMyProfile(b);

    expect(a.id).not.toBe(b.id);
    expect(profileA?.userId).toBe(a.id);
    expect(profileB?.userId).toBe(b.id);
    expect(profileA?.fullName).not.toBe(profileB?.fullName);
  });
});
