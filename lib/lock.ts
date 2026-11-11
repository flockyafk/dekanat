// Очередь по пользователю: параллельные запросы одного пользователя выполняются по одному,
// поэтому суточные лимиты (заявок, запросов к ИИ) нельзя обойти гонкой.
// Работает, пока сервер один (так задано в ТЗ, раздел 7).
const locks = new Map<string, Promise<unknown>>();

export async function withUserLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}
