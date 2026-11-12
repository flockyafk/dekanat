import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { DRAFT_SYSTEM_PROMPT, SYSTEM_PROMPT } from "@/lib/ai-prompt";
import { REQUEST_TYPE_VALUES } from "@/lib/constants";
import {
  getAssistantContext,
  getDraftContext,
  type AssistantContext,
  type DraftContext,
} from "@/lib/data/assistant";
import { withUserLock } from "@/lib/lock";
import { resolveScheduleDates } from "@/lib/ai-schedule";
import { countAiRequest, logAiError, logAiFallback, logAiRecovered } from "@/lib/ai-stats";
import { isKnownRoute } from "@/lib/routes";
import { dateKey } from "@/lib/time";

/*
 * ЕДИНСТВЕННОЕ место, откуда вызывается ИИ (правило 11 из CLAUDE.md).
 * Провайдер скрыт за интерфейсом AiProvider и выбирается переменными окружения:
 *   AI_PROVIDER = stub (по умолчанию, готовые ответы) или amvera (Amvera LLM, формат OpenAI chat/completions)
 *   AI_API_KEY  = ключ (ТОЛЬКО в .env и в секретах проекта на Amvera, не в git, не в браузер)
 *   AI_MODEL    = имя модели в API (по умолчанию qwen3_30b)
 *   AI_BASE_URL = адрес API (по умолчанию https://inference.waw0.amvera.ru/v1)
 * Сменить провайдера = добавить функцию, создающую AiProvider, и вернуть её из getProvider().
 * Текст вопросов, ответы модели и ошибки провайдера нигде не пишутся в журнал.
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
  | { ok: true; text: string; links: AssistantLink[]; source?: "model" | "code" }
  | { ok: false; reason: "limit" | "unavailable" | "invalid" | "forbidden"; text: string };

const MSG = {
  limit: "На сегодня лимит вопросов к помощнику исчерпан. Попробуйте завтра. Остальной кабинет работает как обычно.",
  globalLimit: "На сегодня помощник исчерпал общий лимит запросов. Попробуйте завтра. Остальной кабинет работает как обычно.",
  unavailable: "Помощник сейчас недоступен. Остальной кабинет работает, попробуйте позже.",
  forbidden: "Помощник доступен студентам.",
  invalid: "Напишите вопрос: от 3 до 500 символов.",
};

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 500;
export const SITUATION_MIN = 10;
export const SITUATION_MAX = 300;

export function dailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

/** Общий предел запросов в сутки на всех студентов: защищает месячный пакет токенов (тестовые аккаунты публичны). */
export function totalDailyLimit(): number {
  const n = Number(process.env.AI_TOTAL_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
}

// ---------- Провайдеры ----------

let testProvider: AiProvider | null | undefined;
/** Только для тестов: подменить провайдера (null = «недоступен»). */
export function setAiProviderForTests(p: AiProvider | null | undefined) {
  if (process.env.NODE_ENV === "production") throw new Error("Недоступно в production");
  testProvider = p;
}

const DEFAULT_BASE_URL = "https://inference.waw0.amvera.ru/v1";
const DEFAULT_MODEL = "qwen3_30b";

function getProvider(): AiProvider | null {
  if (testProvider !== undefined) return testProvider;
  const name = (process.env.AI_PROVIDER || "stub").trim();
  if (name === "stub") return stubProvider;
  if (name === "amvera") {
    const apiKey = process.env.AI_API_KEY?.trim();
    if (!apiKey) return null; // ключ не задан: помощник «недоступен», кабинет работает
    const baseUrl = process.env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL;
    // Ключ уходит только по HTTPS (http допустим лишь для localhost при отладке)
    if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl)) return null;
    return createChatCompletionsProvider({
      baseUrl,
      apiKey,
      model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
    });
  }
  return null; // неизвестный провайдер = недоступен
}

/**
 * Режим помощника для интерфейса: «stub» (готовые ответы), «ai» (настоящая модель) или «unavailable».
 * Текст на странице /assistant зависит от режима: про пробную версию пишем только когда работает заглушка.
 */
export function assistantMode(): "stub" | "ai" | "unavailable" {
  const provider = getProvider();
  if (!provider) return "unavailable";
  return provider.name === "stub" ? "stub" : "ai";
}

/** Ошибка провайдера. В сообщении только код, без тела ответа, текста вопроса и ключа. */
export class ProviderError extends Error {
  constructor(public readonly status: number) {
    super(`provider status ${status}`);
  }
}

/**
 * Провайдер для API в формате OpenAI chat/completions (так устроен Amvera LLM Inference).
 * Ключ уходит только в заголовок Authorization на сервере. Таймаут обрывает сам запрос.
 */
export function createChatCompletionsProvider(cfg: { baseUrl: string; apiKey: string; model: string }): AiProvider {
  return {
    name: "chat-completions",
    async complete(req) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs());
      try {
        const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: renderUserMessage(req) },
            ],
            temperature: 0.2,
            max_tokens: 800,
            stream: false,
          }),
          signal: controller.signal,
          cache: "no-store",
          redirect: "error", // ключ не должен уходить по перенаправлению на другой адрес
        });
        if (!res.ok) throw new ProviderError(res.status);
        const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) throw new ProviderError(0);
        // некоторые модели добавляют рассуждения в <think>…</think>: пользователю они не нужны
        return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw new Error("timeout");
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Заглушка: готовые ответы по данным из запроса. Не обращается в сеть, используется для тестов и интерфейса. */
const stubProvider: AiProvider = {
  name: "stub",
  async complete(req) {
    if (req.system === DRAFT_SYSTEM_PROMPT) return stubDraft(JSON.parse(req.data) as DraftContext, req.question);
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
  const outcome = await callModel(user, now, async () => {
    const context = await getAssistantContext(user, now, question);
    return { request: buildProviderRequest(SYSTEM_PROMPT, context, question), context };
  });
  if (!outcome.ok) {
    // Модель не ответила (402, таймаут, сеть, нет ключа). Вопросы о расписании на день недели, дату, «сегодня» и «завтра»
    // код считает сам, поэтому отвечаем из кода без модели. «Помощник недоступен» остаётся только там, где без модели не ответить.
    if (outcome.reason === "unavailable") {
      const fromCode = await scheduleAnswerFromCode(user, question, now);
      if (fromCode) {
        logAiFallback(outcome.lastStatus ?? "unavailable");
        return fromCode;
      }
    }
    return { ok: false, reason: outcome.reason, text: outcome.text };
  }
  const answer = sanitizeAnswer(outcome.raw, outcome.context);
  // Если модель забыла ссылку на раздел, добавляем её по теме вопроса (только из списка маршрутов, только свои id)
  if (answer.links.length === 0 && !/^(В данных этого нет|Я показываю только ваши данные)/.test(answer.text)) {
    answer.links = fallbackLinks(question, outcome.context);
  }
  return { ok: true, ...answer, source: "model" };
}

/**
 * Готовый ответ о расписании без модели: «Пары на <дата> (<неделя>): …» из того же списка, который в обычном случае
 * получает модель. Возвращает null, если вопрос не про расписание на конкретную дату (тогда без модели не ответить).
 */
async function scheduleAnswerFromCode(user: CurrentUser, question: string, now: Date): Promise<AssistantAnswer | null> {
  try {
    const ctx = await getAssistantContext(user, now, question);
    if (ctx.scheduleAnswer.length === 0) return null;
    const text = normalizeDashes(ctx.scheduleAnswer.map((a) => a.text).join("\n"));
    return {
      ok: true,
      text,
      links: [{ href: `/schedule?d=${ctx.scheduleAnswer[0].date}&v=day`, label: "Расписание" }],
      source: "code",
    };
  } catch {
    return null; // не получилось собрать и это: честное «недоступен»
  }
}

/** Ссылки на разделы по теме вопроса. Страховка на случай, когда модель не поставила ссылку сама. */
export function fallbackLinks(question: string, ctx: AssistantContext): AssistantLink[] {
  const q = question.toLowerCase();
  const links: AssistantLink[] = [];
  const add = (href: string, label: string) => {
    if (links.length < 2 && !links.some((l) => l.href === href)) links.push({ href, label });
  };

  if (/справк|заявк|заявлен|статус|обращени|пересдач|выписк/.test(q)) {
    const kinds: [RegExp, string][] = [
      [/справк/, "справка"],
      [/пересдач/, "пересдач"],
      [/академ|выписк/, "академ"],
    ];
    const want = kinds.find(([re]) => re.test(q))?.[1];
    const matching = ctx.requests.filter((r) => !want || r.type.toLowerCase().includes(want));
    if (matching.length === 1) add(`/requests/${matching[0].id}`, matching[0].type);
    else add("/requests", "Заявки");
  }
  const scheduleDates = resolveScheduleDates(question, ctx.today.date);
  if (scheduleDates.length > 0 || /(?<![а-яё])пар[ыау]?(?![а-яё])|расписан|занят/.test(q)) {
    add(`/schedule?d=${scheduleDates[0] ?? ctx.today.date}&v=day`, "Расписание");
  }
  if (/долг|оценк|балл|экзамен|зач[её]т|сессия|успеваем|посещаем|дисциплин/.test(q)) add("/grades", "Учёба");
  if (/объявлен|уведомлен|новост/.test(q)) add("/notifications", "Уведомления");
  if (/дедлайн|срок/.test(q)) add("/", "Сегодня");
  return links;
}

export type DraftResult =
  | { ok: true; type: string; text: string }
  | { ok: false; reason: "limit" | "unavailable" | "invalid" | "forbidden"; text: string };

/**
 * Черновик заявки по описанию ситуации (раздел 4.6 ТЗ). Модель только предлагает текст,
 * заявку студент правит и отправляет сам, автоматической отправки нет.
 * Контекст: только сведения о самом студенте из сессии. Запрос считается в тот же суточный лимит.
 */
export async function draftRequest(
  user: CurrentUser,
  rawSituation: string,
  selectedType: string,
  now: Date = new Date(),
): Promise<DraftResult> {
  if (user.role !== "student") return { ok: false, reason: "forbidden", text: MSG.forbidden };
  const situation = rawSituation.trim();
  if (situation.length < SITUATION_MIN || situation.length > SITUATION_MAX) {
    return { ok: false, reason: "invalid", text: `Опишите ситуацию двумя фразами: от ${SITUATION_MIN} до ${SITUATION_MAX} символов.` };
  }
  const outcome = await callModel(user, now, async () => {
    const context = await getDraftContext(user);
    return { request: buildProviderRequest(DRAFT_SYSTEM_PROMPT, context, situation), context };
  });
  if (!outcome.ok) return outcome;
  return { ok: true, ...sanitizeDraft(outcome.raw, selectedType) };
}

type CallOutcome<C> =
  | { ok: true; raw: string; context: C }
  | { ok: false; reason: "limit" | "unavailable"; text: string; lastStatus?: string };

/**
 * Общий путь любого вызова модели: провайдер, резерв в суточном лимите (на студента и общий),
 * таймаут, возврат запроса при быстром сбое. Данные и вопрос собирает вызывающий только из данных студента из сессии.
 */
async function callModel<C>(
  user: CurrentUser,
  now: Date,
  build: () => Promise<{ request: ProviderRequest; context: C }>,
): Promise<CallOutcome<C>> {
  const provider = getProvider();
  if (!provider) return { ok: false, reason: "unavailable", text: MSG.unavailable };

  const day = dateKey(now);
  // Резерв под общей очередью: параллельными запросами ни лимит студента, ни общий лимит не обойти
  const reserved = await withUserLock("ai:reserve", async () => {
    const row = await prisma.aiUsage.findUnique({ where: { userId_date: { userId: user.id, date: day } } });
    if ((row?.count ?? 0) >= dailyLimit()) return "limit" as const;
    const total = await prisma.aiUsage.aggregate({ where: { date: day }, _sum: { count: true } });
    if ((total._sum.count ?? 0) >= totalDailyLimit()) return "global" as const;
    await prisma.aiUsage.upsert({
      where: { userId_date: { userId: user.id, date: day } },
      update: { count: { increment: 1 } },
      create: { userId: user.id, date: day, count: 1 },
    });
    return "ok" as const;
  });
  if (reserved === "limit") return { ok: false, reason: "limit", text: MSG.limit };
  if (reserved === "global") return { ok: false, reason: "limit", text: MSG.globalLimit };

  countAiRequest();
  let called = false;
  let anyTimeout = false; // был ли таймаут: тогда провайдер мог выполнить запрос и списать токены
  let lastError: unknown;
  let lastStatus: string | undefined;
  try {
    const { request, context } = await build();
    called = true;
    // Одна повторная попытка через 1-2 секунды, только при 402, 429, 5xx и таймауте (нерегулярные 402 «Billing pre-check
    // failed» у провайдера проходят со второго раза). При 400, 401, 403 и остальных не повторяем.
    // Повтор НЕ резервирует суточный лимит заново: запрос студента уже учтён один раз выше.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      try {
        const raw = await withTimeout(provider.complete(request), timeoutMs() + 500);
        if (attempt === 2) logAiRecovered(lastStatus ?? "unknown", Date.now() - started);
        return { ok: true, raw, context };
      } catch (e) {
        lastError = e;
        lastStatus = errorKind(e);
        if (lastStatus === "timeout") anyTimeout = true;
        const willRetry = attempt === 1 && isRetryable(e);
        logAiError(lastStatus, attempt, Date.now() - started, willRetry);
        if (!willRetry) break;
        await new Promise((r) => setTimeout(r, retryDelayMs()));
      }
    }
  } catch (e) {
    lastError = e; // ошибка до обращения к провайдеру (сбор данных)
    lastStatus = "build";
  }

  // Запрос возвращается в лимит только если токены точно не потрачены: ошибка до обращения к провайдеру,
  // отказ провайдера со статусом 4xx/5xx или сеть недоступна. Таймаут (в любой из попыток), пустой или битый ответ
  // запрос НЕ возвращают: провайдер мог выполнить его и списать токены, иначе лимит можно было бы обойти.
  // Текст вопроса, ответ и ошибка провайдера не пишутся в журнал.
  const refundable =
    !called || (!anyTimeout && ((lastError instanceof ProviderError && lastError.status >= 400) || lastError instanceof TypeError));
  if (refundable) {
    await withUserLock("ai:reserve", () =>
      prisma.aiUsage.updateMany({
        where: { userId: user.id, date: day, count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      }),
    );
  }
  return { ok: false, reason: "unavailable", text: MSG.unavailable, lastStatus };
}

/** Вид ошибки для счётчика и журнала: код статуса, timeout, network, empty или other. Без текста ошибки. */
function errorKind(e: unknown): string {
  if (e instanceof ProviderError) return e.status === 0 ? "empty" : String(e.status);
  if ((e as Error)?.message === "timeout") return "timeout";
  if (e instanceof TypeError) return "network";
  return "other";
}

/** Повторяем при 402, 429, 5xx и таймауте. Не повторяем при 400, 401, 403, пустом ответе и сетевой ошибке. */
function isRetryable(e: unknown): boolean {
  if (e instanceof ProviderError) return e.status === 402 || e.status === 429 || e.status >= 500;
  return (e as Error)?.message === "timeout";
}

function retryDelayMs(): number {
  const n = Number(process.env.AI_RETRY_DELAY_MS);
  return Number.isFinite(n) && n >= 0 && process.env.AI_RETRY_DELAY_MS !== "" ? Math.min(n, 5000) : 1500;
}

function timeoutMs(): number {
  return Number(process.env.AI_TIMEOUT_MS) || 20_000; // на одну попытку; две попытки и пауза до 42 с
}

/**
 * Запрос провайдеру. Данные и вопрос не могут «закрыть» свой блок и подделать границы:
 * в JSON символы < и > заменяются на \u003c и \u003e (это тот же JSON), в вопросе на ‹ и ›.
 */
export function buildProviderRequest(system: string, context: unknown, question: string): ProviderRequest {
  return {
    system,
    data: JSON.stringify(context).replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
    question: question.replace(/</g, "‹").replace(/>/g, "›"),
  };
}

/**
 * Черновик от модели это обычный текст. Первая строка «ВИД: …» выбирает вид заявки из каталога
 * (иначе остаётся выбранный студентом), остальное текст заявления без ссылок и разметки.
 */
export function sanitizeDraft(raw: string, selectedType: string): { type: string; text: string } {
  const match = /^\s*ВИД:\s*(.+)$/im.exec(raw);
  const proposed = match?.[1].trim().replace(/[«»".]+$/g, "");
  const type = proposed && REQUEST_TYPE_VALUES.includes(proposed) ? proposed : REQUEST_TYPE_VALUES.includes(selectedType) ? selectedType : REQUEST_TYPE_VALUES[REQUEST_TYPE_VALUES.length - 1];
  const body = (match ? raw.replace(match[0], "") : raw)
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\*\*|__|`/g, "") // разметка не нужна: поле «Текст» обычное
    .replace(/^[#>]+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1000);
  return { type, text: normalizeDashes(body) || "Не удалось составить заявление по этому описанию. Опишите, что вам нужно от деканата." };
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

/**
 * Длинное тире в ответах не нужно: между словами ставим запятую, в диапазонах дефис (09:00-10:30).
 */
export function normalizeDashes(text: string): string {
  return text
    .replace(/(\d)\s*[–—―]\s*(\d)/g, "$1-$2") // диапазоны: 10:40–12:10 -> 10:40-12:10
    .replace(/\s+[—―–]\s+/g, ", ") // между словами: запятая
    .replace(/[—―–]/g, "-"); // остальное: обычный дефис
}

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
    // внешние адреса в тексте ответа не нужны: из объявления или заявки их мог повторить сам ответ
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[внешняя ссылка скрыта]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
  return { text: normalizeDashes(text) || "В данных этого нет.", links };
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

export function stubAnswer(ctx: AssistantContext, question: string): string {
  const q = question.toLowerCase();
  if (!ctx.student) return NOT_FOUND;
  if (mentionsOtherPerson(question, ctx.student.name)) return REFUSE_OTHERS;
  // Темы, которых в данных кабинета нет (ТЗ, раздел 16: оплата, общежитие, библиотека и т. п.). Ключевое слово
  // «завтра» в таком вопросе не должно приводить к ответу про расписание.
  if (/погод|общежит|стипенд|столов|библиотек|оплат|стоит|цена|анекдот|рецепт|курс (доллара|евро|валют)|новости мира/.test(q)) {
    return NOT_FOUND;
  }

  // Расписание на день недели, дату, «сегодня» и «завтра» уже посчитал код: заглушка, как и настоящая модель,
  // только пересказывает готовый список «Пары на …».
  if (ctx.scheduleAnswer.length > 0) {
    const text = ctx.scheduleAnswer.map((a) => a.text).join("\n");
    return `${text}\n[[/schedule?d=${ctx.scheduleAnswer[0].date}&v=day|Расписание]]`;
  }

  if (/долг|хвост/.test(q)) {
    if (ctx.session.debts.length === 0) return "Долгов нет.\n[[/grades|Учёба]]";
    return `Долги: ${ctx.session.debts.join(", ")}.\n[[/grades|Учёба и сессия]]`;
  }

  if (/дедлайн|срок|сдать|сдачи/.test(q)) {
    if (ctx.deadlines.length === 0) return "Ближайших дедлайнов на две недели вперёд нет.\n[[/|Сегодня]]";
    const lines = ctx.deadlines.map((d) => `${d.dueText}: ${d.title}`);
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

/** Черновик заявки заглушкой: вид по ключевым словам, текст по шаблону из сведений о студенте и описания. */
export function stubDraft(ctx: DraftContext, situation: string): string {
  const q = situation.toLowerCase();
  const who = ctx.student ? ctx.student.name : "[ФИО]";
  const about = ctx.student
    ? `студент(ка) ${ctx.student.course} курса, группа ${ctx.student.group}, направление «${ctx.student.direction}»`
    : "студент(ка)";
  const clean = situation.trim().replace(/\s+/g, " ");

  let type = "Свободное обращение в деканат";
  let ask = "Прошу рассмотреть моё обращение.";
  if (/военкомат|воинск/.test(q)) {
    type = "Справка для военкомата";
    ask = "Прошу выдать справку для военкомата.";
  } else if (/справк/.test(q)) {
    type = "Справка об обучении";
    ask = "Прошу выдать справку об обучении.";
  } else if (/пересда|не сдал|не сдала|незач|двойк|долг/.test(q)) {
    type = "Заявление на пересдачу";
    ask = "Прошу разрешить пересдачу. Дисциплина и дата: [укажите дисциплину и дату].";
  } else if (/академ/.test(q)) {
    type = "Заявление на академическую выписку";
    ask = "Прошу оформить академическую выписку.";
  }
  return `ВИД: ${type}\n\nВ деканат.\nЯ, ${who}, ${about}. ${clean}\n${ask}\n${who}`;
}
