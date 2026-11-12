import { describe, expect, it } from "vitest";
import {
  CHAT_PREFIX,
  MAX_PAIRS,
  chatKey,
  clearAllHistories,
  clearHistory,
  loadHistory,
  saveHistory,
  trimToLastPairs,
  type ChatMessage,
  type StorageLike,
} from "@/lib/chat-history";

/** Хранилище как в браузере: общее для всех пользователей этого браузера. */
function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}

const pair = (n: number): ChatMessage[] => [
  { id: n * 2, role: "user", text: `Вопрос ${n}` },
  { id: n * 2 + 1, role: "assistant", text: `Ответ ${n}`, links: [{ href: "/grades", label: "Учёба" }] },
];
const dialog = (count: number) => Array.from({ length: count }, (_, i) => pair(i + 1)).flat();

describe("история диалога в браузере: студент А не видит историю студента Б", () => {
  it("при смене аккаунта в одном браузере у каждого своя история (ключ с id пользователя)", () => {
    const storage = fakeStorage();
    saveHistory(storage, "user-A", [{ id: 1, role: "user", text: "Секретный вопрос студента А" }, { id: 2, role: "assistant", text: "Ответ студенту А" }]);
    saveHistory(storage, "user-B", [{ id: 1, role: "user", text: "Вопрос студента Б" }]);

    expect(loadHistory(storage, "user-A").map((m) => m.text)).toEqual(["Секретный вопрос студента А", "Ответ студенту А"]);
    expect(loadHistory(storage, "user-B").map((m) => m.text)).toEqual(["Вопрос студента Б"]);
    // студент без истории не получает чужую
    expect(loadHistory(storage, "user-C")).toEqual([]);
    // ключи разные, а в чужом ключе чужих текстов нет
    expect(chatKey("user-A")).not.toBe(chatKey("user-B"));
    expect(storage.data.get(chatKey("user-B"))).not.toContain("Секретный вопрос студента А");
    expect(storage.data.get(chatKey("user-A"))).not.toContain("Вопрос студента Б");
  });

  it("пустой или отсутствующий id пользователя ничего не читает и не пишет", () => {
    const storage = fakeStorage();
    saveHistory(storage, "user-A", dialog(2));
    expect(loadHistory(storage, "")).toEqual([]);
    saveHistory(storage, "", dialog(1));
    expect(storage.data.size).toBe(1);
  });

  it("очистка одного пользователя не трогает других, выход стирает истории всех", () => {
    const storage = fakeStorage();
    saveHistory(storage, "user-A", dialog(2));
    saveHistory(storage, "user-B", dialog(1));
    storage.setItem("другая-настройка", "остаётся");
    clearHistory(storage, "user-A");
    expect(loadHistory(storage, "user-A")).toEqual([]);
    expect(loadHistory(storage, "user-B")).toHaveLength(2);
    saveHistory(storage, "user-A", dialog(1));
    clearAllHistories(storage); // выход из аккаунта или страница входа
    expect(loadHistory(storage, "user-A")).toEqual([]);
    expect(loadHistory(storage, "user-B")).toEqual([]);
    expect([...storage.data.keys()].filter((k) => k.startsWith(CHAT_PREFIX))).toEqual([]);
    expect(storage.getItem("другая-настройка")).toBe("остаётся");
  });
});

describe("хранение: последние 10 пар, форма данных, защита", () => {
  it("сохраняются только последние 10 пар вопрос-ответ", () => {
    const storage = fakeStorage();
    saveHistory(storage, "u", dialog(14));
    const loaded = loadHistory(storage, "u");
    expect(loaded).toHaveLength(MAX_PAIRS * 2);
    expect(loaded[0].text).toBe("Вопрос 5"); // первые четыре пары отброшены
    expect(loaded[loaded.length - 1].text).toBe("Ответ 14");
    expect(trimToLastPairs(dialog(3))).toHaveLength(6);
    // вопрос без ответа (студент ушёл со страницы) считается за пару
    const dangling = [...dialog(10), { id: 99, role: "user", text: "Без ответа" } as ChatMessage];
    expect(trimToLastPairs(dangling).filter((m) => m.role === "user")).toHaveLength(10);
  });

  it("пустая история удаляет ключ, а не хранит пустой массив", () => {
    const storage = fakeStorage();
    saveHistory(storage, "u", dialog(1));
    saveHistory(storage, "u", []);
    expect(storage.getItem(chatKey("u"))).toBeNull();
  });

  it("испорченные и подделанные данные в хранилище не ломают страницу и не пропускают опасные ссылки", () => {
    const storage = fakeStorage();
    storage.setItem(chatKey("u"), "это не JSON {{{");
    expect(loadHistory(storage, "u")).toEqual([]);
    storage.setItem(chatKey("u"), JSON.stringify({ не: "массив" }));
    expect(loadHistory(storage, "u")).toEqual([]);
    storage.setItem(
      chatKey("u"),
      JSON.stringify([
        { id: 1, role: "user", text: "Вопрос" },
        {
          id: 2,
          role: "assistant",
          text: "Ответ",
          links: [
            { href: "javascript:alert(1)", label: "Нажми" },
            { href: "https://evil.example/x", label: "Внешняя" },
            { href: "//evil.example", label: "Схема" },
            { href: "/admin", label: "Админка" },
            { href: "/schedule?d=2026-11-16&v=day", label: "Расписание" },
          ],
        },
        { id: 3, role: "system", text: "чужая роль" },
        { id: 4, role: "assistant" },
        "строка",
        null,
      ]),
    );
    const loaded = loadHistory(storage, "u");
    expect(loaded).toHaveLength(2);
    expect(loaded[1].links).toEqual([{ href: "/schedule?d=2026-11-16&v=day", label: "Расписание" }]);
  });

  it("параметры в ссылках допустимы только у расписания и только в виде даты; id сообщений всегда уникальны", () => {
    const storage = fakeStorage();
    storage.setItem(
      chatKey("u"),
      JSON.stringify([
        { id: 7, role: "user", text: "Вопрос" },
        {
          id: 7, // повторяющийся id из хранилища
          role: "assistant",
          text: "Ответ",
          links: [
            { href: "/grades?next=https://evil.example", label: "Учёба с параметром" },
            { href: "/schedule?x=1", label: "Лишний параметр" },
            { href: "/schedule?d=2026-11-16&v=week", label: "Неделя" },
            { href: "/requests/abc123", label: "Заявка" },
          ],
        },
      ]),
    );
    const loaded = loadHistory(storage, "u");
    expect(loaded[1].links!.map((l) => l.href)).toEqual(["/schedule?d=2026-11-16&v=week", "/requests/abc123"]);
    expect(new Set(loaded.map((m) => m.id)).size).toBe(loaded.length);
  });

  it("очень длинные тексты обрезаются, лишние сообщения отбрасываются", () => {
    const storage = fakeStorage();
    storage.setItem(chatKey("u"), JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, role: i % 2 ? "assistant" : "user", text: "а".repeat(5000) }))));
    const loaded = loadHistory(storage, "u");
    expect(loaded.length).toBeLessThanOrEqual(MAX_PAIRS * 2 + 2);
    expect(loaded.every((m) => m.text.length <= 2000)).toBe(true);
  });

  it("недоступное хранилище (приватный режим, запрет) не вызывает ошибок", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadHistory(broken, "u")).toEqual([]);
    expect(() => saveHistory(broken, "u", dialog(1))).not.toThrow();
    expect(() => clearHistory(broken, "u")).not.toThrow();
    expect(() => clearAllHistories(broken)).not.toThrow();
    expect(loadHistory(null, "u")).toEqual([]);
    expect(() => saveHistory(null, "u", dialog(1))).not.toThrow();
  });
});

describe("история не уходит на сервер", () => {
  it("модуль истории не делает сетевых запросов и не вызывает серверных действий", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/chat-history.ts", "utf8");
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|server-only|"use server"/);
    // компонент отправляет на сервер только текущий вопрос (askAction(q)), история в запрос не попадает
    const box = readFileSync("components/ask-box.tsx", "utf8");
    expect(box).toMatch(/askAction\(q\)/);
    expect(box).not.toMatch(/askAction\([^)]*messages/);
  });
});
