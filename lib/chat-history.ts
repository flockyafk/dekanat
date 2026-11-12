import { isKnownRoute } from "@/lib/routes";

/*
 * История диалога с помощником ТОЛЬКО в браузере студента (sessionStorage): на сервер и в журнал она не уходит
 * (правило 13, CLAUDE.md), в базе её нет. Ключ содержит id пользователя, поэтому в одном браузере студент Б не видит
 * историю студента А. При выходе из аккаунта и на странице входа все истории стираются.
 * Хранится не больше 10 последних пар «вопрос-ответ». Модуль чистый: работает с любым объектом, похожим на Storage.
 */

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  links?: { href: string; label: string }[];
  error?: boolean;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> & { readonly length?: number; key?: (i: number) => string | null };

export const CHAT_PREFIX = "dekanat:chat:";
export const MAX_PAIRS = 10;
const MAX_TEXT = 2000;

export const chatKey = (userId: string) => `${CHAT_PREFIX}${userId}`;

/** Оставляет последние MAX_PAIRS пар: считаем по сообщениям студента с конца. */
export function trimToLastPairs(messages: ChatMessage[], maxPairs = MAX_PAIRS): ChatMessage[] {
  let users = 0;
  let start = 0; // индекс вопроса, с которого начинаются последние maxPairs пар
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      users += 1;
      if (users === maxPairs) start = i;
      if (users > maxPairs) return messages.slice(start); // старее этого вопроса ничего не оставляем, ответа без вопроса не будет
    }
  }
  return messages;
}

/**
 * Ссылка из истории: маршрут кабинета, а параметры только у расписания и только в виде даты (как в ответах помощника,
 * lib/ai.ts, sanitizeAnswer). Любые другие параметры из хранилища отбрасываем.
 */
function isSafeHistoryLink(href: string): boolean {
  if (!isKnownRoute(href)) return false;
  const q = href.indexOf("?");
  if (q < 0) return true;
  return href.slice(0, q) === "/schedule" && /^\?d=\d{4}-\d{2}-\d{2}(&v=(day|week))?$/.test(href.slice(q));
}

/** Данные из хранилища недоверенные: проверяем форму, длины и ссылки (только маршруты кабинета). */
function sanitize(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw.slice(0, MAX_PAIRS * 2 + 2)) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string") continue;
    const links = Array.isArray(m.links)
      ? m.links
          .filter(
            (l): l is { href: string; label: string } =>
              !!l &&
              typeof (l as { href?: unknown }).href === "string" &&
              typeof (l as { label?: unknown }).label === "string" &&
              isSafeHistoryLink((l as { href: string }).href),
          )
          .slice(0, 3)
          .map((l) => ({ href: l.href, label: l.label.slice(0, 60) }))
      : undefined;
    out.push({
      id: out.length + 1, // номера задаём заново подряд: из хранилища чужие id не берём, повторов не будет
      role: m.role,
      text: m.text.slice(0, MAX_TEXT),
      ...(links && links.length ? { links } : {}),
      ...(m.error === true ? { error: true } : {}),
    });
  }
  return trimToLastPairs(out);
}

export function loadHistory(storage: StorageLike | null, userId: string): ChatMessage[] {
  if (!storage || !userId) return [];
  try {
    const raw = storage.getItem(chatKey(userId));
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return []; // хранилище недоступно или испорчено: начинаем с пустой истории
  }
}

export function saveHistory(storage: StorageLike | null, userId: string, messages: ChatMessage[]) {
  if (!storage || !userId) return;
  try {
    const trimmed = trimToLastPairs(messages).map((m) => ({ ...m, text: m.text.slice(0, MAX_TEXT) }));
    if (trimmed.length === 0) storage.removeItem(chatKey(userId));
    else storage.setItem(chatKey(userId), JSON.stringify(trimmed));
  } catch {
    // переполнение или запрет хранилища: диалог просто не сохранится, работа не прерывается
  }
}

export function clearHistory(storage: StorageLike | null, userId: string) {
  try {
    storage?.removeItem(chatKey(userId));
  } catch {
    /* нечего делать */
  }
}

/** Стереть истории ВСЕХ пользователей в этом браузере (выход из аккаунта, страница входа). */
export function clearAllHistories(storage: StorageLike | null) {
  if (!storage || typeof storage.length !== "number" || !storage.key) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(CHAT_PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    /* нечего делать */
  }
}

/** sessionStorage браузера или null, если он недоступен (приватный режим, запрет, серверный рендер). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
