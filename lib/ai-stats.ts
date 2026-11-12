/*
 * Счётчик ошибок модели и журнал для разбора закономерностей (например, нерегулярных 402 от провайдера).
 * Правило 13 (CLAUDE.md): в журнал НЕ пишутся тексты вопросов, ответы модели, данные студентов и ключ.
 * Пишутся только вид события, статус ошибки, номер попытки, время ответа в миллисекундах и накопленные счётчики.
 * Счётчики живут в памяти процесса (сбрасываются при перезапуске), строки журнала остаются в логах хостинга.
 */

export type AiLogEvent = "error" | "recovered" | "fallback";

export type AiStats = {
  since: string;
  requests: number;
  errorsByStatus: Record<string, number>;
  retries: number;
  recovered: number;
  fallbackAnswers: number;
};

const stats: AiStats = {
  since: new Date().toISOString(),
  requests: 0,
  errorsByStatus: {},
  retries: 0,
  recovered: 0,
  fallbackAnswers: 0,
};

/** Копия счётчиков (для тестов и отладки). */
export function getAiStats(): AiStats {
  return { ...stats, errorsByStatus: { ...stats.errorsByStatus } };
}

/** Только для тестов: обнулить счётчики. */
export function resetAiStatsForTests() {
  stats.since = new Date().toISOString();
  stats.requests = 0;
  stats.errorsByStatus = {};
  stats.retries = 0;
  stats.recovered = 0;
  stats.fallbackAnswers = 0;
}

function write(line: Record<string, unknown>) {
  // В тестах молчим, чтобы не засорять вывод; тест журнала включает вывод через AI_LOG=1
  if (process.env.NODE_ENV === "test" && process.env.AI_LOG !== "1") return;
  console.warn(JSON.stringify({ t: new Date().toISOString(), ...line }));
}

export function countAiRequest() {
  stats.requests += 1;
}

/** Ошибка попытки: status это «402», «429», «500», «timeout», «network», «empty» или «other». */
export function logAiError(status: string, attempt: number, ms: number, willRetry: boolean) {
  stats.errorsByStatus[status] = (stats.errorsByStatus[status] ?? 0) + 1;
  if (willRetry) stats.retries += 1;
  write({ ai: "error", status, attempt, ms, willRetry, errorsByStatus: stats.errorsByStatus, requests: stats.requests });
}

/** Повтор помог: вторая попытка вернула ответ. */
export function logAiRecovered(afterStatus: string, ms: number) {
  stats.recovered += 1;
  write({ ai: "recovered", afterStatus, attempt: 2, ms, recovered: stats.recovered, errorsByStatus: stats.errorsByStatus });
}

/** Модель не ответила, ответ собран кодом (вопросы о расписании). */
export function logAiFallback(status: string) {
  stats.fallbackAnswers += 1;
  write({ ai: "fallback", lastStatus: status, fallbackAnswers: stats.fallbackAnswers, errorsByStatus: stats.errorsByStatus });
}
