import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/ai-prompt";
import { getAssistantContext, type AssistantContext } from "@/lib/data/assistant";
import { withUserLock } from "@/lib/lock";
import { isKnownRoute } from "@/lib/routes";
import { dateKey } from "@/lib/time";

/*
 * ЕДИНСТВЕННОЕ место, откуда вызывается ИИ (правило 11 из CLAUDE.md).
 * Провайдер скрыт за интерфейсом AiProvider. Провайдера выбирает автор проекта,
 * до выбора работает заглушка с готовыми ответами. Сменить провайдера = добавить класс
 * и вернуть его из getProvider(); остальной код не меняется.
 * Ключ провайдера будет только в .env на сервере. Текст вопросов нигде не пишется в журнал.
 */

/** То, что получает провайдер. Данные студента и вопрос отделены от инструкций. */
export type ProviderRequest = {
  system: string; // инструкции
  data: string; // JSON с данными ТОЛЬКО текущего студента
  question: string; // вопрос студента (тоже данные, не инструкции)
};

export interface AiProvider {
  name: string;
  complete(req: ProviderRequest): Promise<string>;
}

/** Как реальный провайдер увидит запрос: данные и вопрос в отдельных блоках, помеченных как данные. */
export function renderUserMessage(req: ProviderRequest): string {
  return `<данные_студента>\n${req.data}\n</данные_студента>\n<вопрос_студента>\n${req.question}\n</вопрос_студента>`;
}

export type AssistantLink = { href: string; label: string };
export type AssistantAnswer =
  | { ok: true; text: string; links: AssistantLink[] }
  | { ok: false; reason: "limit" | "unavailable" | "invalid" | "forbidden"; text: string };

const MSG = {
  limit: "На сегодня лимит вопросов к помощнику исчерпан. Попробуйте завтра. Остальной кабинет работает как обычно.",
  unavailable: "Помощник сейчас недоступен. Остальной кабинет работает, попробуйте позже.",
  forbidden: "Помощник доступен студентам.",
  invalid: "Напишите вопрос: от 3 до 500 символов.",
};

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 500;

export function dailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

// ---------- Провайдеры ----------

let testProvider: AiProvider | null | undefined;
/** Только для тестов: подменить провайдера (null = «недоступен»). */
export function setAiProviderForTests(p: AiProvider | null | undefined) {
  if (process.env.NODE_ENV === "production") throw new Error("Недоступно в production");
  testProvider = p;
}

function getProvider(): AiProvider | null {
  if (testProvider !== undefined) return testProvider;
  const name = process.env.AI_PROVIDER || "stub";
  if (name === "stub") return stubProvider;
  return null; // реальные провайдеры подключаются после выбора автором проекта
}

/** Заглушка: готовые ответы по данным из запроса. Не обращается в сеть, используется для тестов и интерфейса. */
const stubProvider: AiProvider = {
  name: "stub",
  async complete(req) {
    return stubAnswer(JSON.parse(req.data) as AssistantContext, req.question);
  },
};

// ---------- Основная функция ----------

/**
 * Вопрос помощнику. Контекст собирается на сервере из данных текущего студента из сессии,
 * проверяется суточный лимит, ответ очищается (ссылки только из списка маршрутов, только свои id).
 */
export async function askAssistant(user: CurrentUser, rawQuestion: string, now: Date = new Date()): Promise<AssistantAnswer> {
  if (user.role !== "student") return { ok: false, reason: "forbidden", text: MSG.forbidden };
  const question = rawQuestion.trim();
  if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
    return { ok: false, reason: "invalid", text: MSG.invalid };
  }
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "unavailable", text: MSG.unavailable };

  const day = dateKey(now);
  // Резервируем запрос под очередью по студенту: параллельными запросами лимит не обойти
  const reserved = await withUserLock(`ai:${user.id}`, async () => {
    const row = await prisma.aiUsage.findUnique({ where: { userId_date: { userId: user.id, date: day } } });
    if ((row?.count ?? 0) >= dailyLimit()) return false;
    await prisma.aiUsage.upsert({
      where: { userId_date: { userId: user.id, date: day } },
      update: { count: { increment: 1 } },
      create: { userId: user.id, date: day, count: 1 },
    });
    return true;
  });
  if (!reserved) return { ok: false, reason: "limit", text: MSG.limit };

  let timedOut = false;
  try {
    const context = await getAssistantContext(user, now);
    const raw = await withTimeout(provider.complete(buildProviderRequest(context, question)), timeoutMs());
    return { ok: true, ...sanitizeAnswer(raw, context) };
  } catch (e) {
    timedOut = (e as Error)?.message === "timeout";
    // Быстрый сбой (запрос не выполнен): запрос не считается потраченным.
    // Таймаут не возвращает запрос: провайдер мог выполнить его и списать деньги, иначе лимит можно было бы обойти.
    // Текст вопроса и ошибки не пишем в журнал.
    if (!timedOut) {
      await withUserLock(`ai:${user.id}`, () =>
        prisma.aiUsage.updateMany({
          where: { userId: user.id, date: day, count: { gt: 0 } },
          data: { count: { decrement: 1 } },
        }),
      );
    }
    return { ok: false, reason: "unavailable", text: MSG.unavailable };
  }
}

function timeoutMs(): number {
  return Number(process.env.AI_TIMEOUT_MS) || 20_000;
}

/**
 * Запрос провайдеру. Данные и вопрос не могут «закрыть» свой блок и подделать границы:
 * в JSON символы < и > заменяются на \u003c и \u003e (это тот же JSON), в вопросе на ‹ и ›.
 */
export function buildProviderRequest(context: AssistantContext, question: string): ProviderRequest {
  return {
    system: SYSTEM_PROMPT,
    data: JSON.stringify(context).replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
    question: question.replace(/</g, "‹").replace(/>/g, "›"),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---------- Очистка ответа модели ----------

const LINK_MARK = /\[\[([^\]|]{1,200})\|([^\]]{1,60})\]\]/g;

/**
 * Ответ модели это обычный текст. Из него убираются управляющие символы, а ссылки вида [[маршрут|подпись]]
 * оставляются только если маршрут есть в списке маршрутов кабинета, а id дисциплины или заявки принадлежит
 * этому студенту (по контексту). Всё остальное (внешние адреса, чужие id, javascript:) отбрасывается.
 */
export function sanitizeAnswer(raw: string, ctx: AssistantContext): { text: string; links: AssistantLink[] } {
  const ownIds = new Set<string>([...ctx.courses.map((c) => c.id), ...ctx.requests.map((r) => r.id)]);
  const links: AssistantLink[] = [];

  const withoutMarks = raw.replace(LINK_MARK, (_m, href: string, label: string) => {
    const clean = href.trim();
    const path = clean.split("?")[0];
    const dynamic = /^\/(?:grades|requests)\/([A-Za-z0-9_-]+)$/.exec(path);
    let allowed = isKnownRoute(clean);
    // /grades/<id> и /requests/<id>: только id этого студента (кроме страницы новой заявки)
    if (allowed && dynamic && path !== "/requests/new") allowed = ownIds.has(dynamic[1]);
    // Параметры в ссылке модели допустимы только у расписания: ?d=ГГГГ-ММ-ДД или ?d=ГГГГ-ММ-ДД&v=day|week
    if (allowed && clean.includes("?")) {
      allowed = path === "/schedule" && /^\?d=\d{4}-\d{2}-\d{2}(&v=(day|week))?$/.test(clean.slice(clean.indexOf("?")));
    }
    if (allowed && links.length < 3 && !links.some((l) => l.href === clean)) {
      links.push({ href: clean, label: label.replace(/[\u0000-\u001f<>]/g, "").trim() || "Открыть" });
    }
    return "";
  });

  const text = withoutMarks
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
  return { text: text || "В данных этого нет.", links };
}

// ---------- Заглушка: готовые ответы по данным ----------

const REFUSE_OTHERS = "Я показываю только ваши данные. Сведения о других студентах я не даю.";
const NOT_FOUND =
  "В данных этого нет. Я отвечаю по вашему расписанию, учёбе, заявкам и объявлениям: спросите, например, «что у меня завтра» или «какие у меня долги».";

function mentionsOtherPerson(question: string, ownName: string): boolean {
  const own = new Set(ownName.split(/\s+/).map((p) => p.toLowerCase().slice(0, 4)));
  if (/(другого|чужого|чужие|чужой|одногруппник|соседа по)/i.test(question)) return true;
  // «студента Петрова», «у Максима Петрова»: слова с заглавной буквы не в начале фразы, кроме своего имени
  const words = question.split(/\s+/).map((w) => w.replace(/[^А-Яа-яЁё-]/g, ""));
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (/^[А-ЯЁ][а-яё]{2,}$/.test(w) && !own.has(w.toLowerCase().slice(0, 4))) {
      const prev = words[i - 1].toLowerCase();
      if (/^(студент[а-яё]*|одногруппник[а-яё]*|у|для|про|о|об)$/.test(prev) || /^[А-ЯЁ][а-яё]{2,}$/.test(words[i - 1]) || /^[А-ЯЁ][а-яё]{2,}$/.test(words[i + 1] ?? "")) {
        return true;
      }
    }
  }
  return false;
}

function lessonsText(day: AssistantContext["days"][number], title: string): string {
  const items = day.lessons as {
    start: string;
    end: string;
    title: string;
    kind: string;
    room: string;
    cancelled: boolean;
    change: string | null;
  }[];
  const head = `${title} (${day.weekday}, ${day.date})`;
  if (items.length === 0) return `${head}: пар нет.\n[[/schedule?d=${day.date}&v=day|Расписание]]`;
  const lines = items.map(
    (l) =>
      `${l.start}–${l.end} ${l.title}, ${l.kind}, ${l.room}${l.cancelled ? ", ОТМЕНЕНА" : ""}${l.change && !l.cancelled ? `. ${l.change}` : ""}`,
  );
  return `${head}:\n${lines.join("\n")}\n[[/schedule?d=${day.date}&v=day|Расписание]]`;
}

export function stubAnswer(ctx: AssistantContext, question: string): string {
  const q = question.toLowerCase();
  if (!ctx.student) return NOT_FOUND;
  if (mentionsOtherPerson(question, ctx.student.name)) return REFUSE_OTHERS;

  if (/послезавтра/.test(q)) return lessonsText(ctx.days[2], "Послезавтра");
  if (/завтра/.test(q)) return lessonsText(ctx.days[1], "Завтра");
  if (/(сегодня|расписан|какие пары|что у меня сейчас)/.test(q)) return lessonsText(ctx.days[0], "Сегодня");

  if (/долг|хвост/.test(q)) {
    if (ctx.session.debts.length === 0) return "Долгов нет.\n[[/grades|Учёба]]";
    return `Долги: ${ctx.session.debts.join(", ")}.\n[[/grades|Учёба и сессия]]`;
  }

  if (/дедлайн|срок|сдать|сдачи/.test(q)) {
    if (ctx.deadlines.length === 0) return "Ближайших дедлайнов на две недели вперёд нет.\n[[/|Сегодня]]";
    const lines = ctx.deadlines.map((d) => `${d.due}: ${d.title}`);
    return `Ближайшие дедлайны:\n${lines.join("\n")}\n[[/|Сегодня]]`;
  }

  if (/справк|заявк|заявлен|статус|обращени|пересдач|выписк/.test(q)) {
    const kinds: [RegExp, string][] = [
      [/справк/, "Справка"],
      [/пересдач/, "пересдач"],
      [/академ|выписк/, "академ"],
      [/военкомат/, "военкомат"],
    ];
    const want = kinds.find(([re]) => re.test(q))?.[1];
    const list = ctx.requests.filter((r) => !want || r.type.toLowerCase().includes(want.toLowerCase()));
    if (list.length === 0) return "В данных этого нет: заявок такого вида у вас не найдено.\n[[/requests|Заявки]]";
    const lines = list.map(
      (r) => `${r.type}: ${r.status}${r.deanComment ? `. Комментарий деканата: ${r.deanComment}` : ""}\n[[/requests/${r.id}|${r.type}]]`,
    );
    return lines.join("\n");
  }

  if (/экзамен|зач[её]т|сессия/.test(q)) {
    if (ctx.session.upcoming.length === 0) return "Назначенных экзаменов и зачётов в данных нет.\n[[/grades|Учёба]]";
    const lines = ctx.session.upcoming.map((e) => `${e.date}: ${e.title} (${e.control})`);
    return `Впереди:\n${lines.join("\n")}\n[[/grades|Сессия]]`;
  }

  if (/балл|оценк|успеваем|риск|посещаем/.test(q)) {
    const risk = ctx.courses.filter((c) => c.atRisk);
    const scores = ctx.courses.map((c) => `${c.title}: ${c.average ?? "оценок нет"}`).join("\n");
    return `Баллы по дисциплинам:\n${scores}\n${
      risk.length ? `В зоне риска: ${risk.map((c) => `${c.title} (${c.riskReasons.join(", ")})`).join("; ")}.` : "Зоны риска нет."
    }\n[[/grades|Учёба]]`;
  }

  if (/объявлен|новост/.test(q)) {
    if (ctx.announcements.length === 0) return "Объявлений в данных нет.\n[[/notifications|Уведомления]]";
    return `${ctx.announcements.map((a) => `${a.title}: ${a.text}`).join("\n")}\n[[/notifications|Уведомления]]`;
  }

  return NOT_FOUND;
}
