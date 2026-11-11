// Все даты кабинета считаются по Москве (UTC+3, без перехода на летнее время),
// потому что сервер хостинга может работать в UTC.
const MSK_MS = 3 * 60 * 60 * 1000;

/** Время пар по номерам (вымышленная сетка). */
export const SLOT_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: "09:00", end: "10:30" },
  2: { start: "10:40", end: "12:10" },
  3: { start: "12:40", end: "14:10" },
  4: { start: "14:20", end: "15:50" },
  5: { start: "16:00", end: "17:30" },
  6: { start: "17:40", end: "19:10" },
};

export const WEEKDAYS_FULL = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
export const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Дата по Москве в виде «2026-11-12». */
export function dateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + MSK_MS).toISOString().slice(0, 10);
}

/** Прибавить дни к ключу даты. */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** День недели: 1 = понедельник ... 7 = воскресенье. */
export function weekdayOf(key: string): number {
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Номер недели по ISO. */
export function isoWeek(key: string): number {
  const d = new Date(`${key}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Нечётная неделя считается верхней, чётная нижней. */
export function weekParityOf(key: string): "upper" | "lower" {
  return isoWeek(key) % 2 === 1 ? "upper" : "lower";
}

/** Минуты от начала суток по Москве. */
export function minutesOfDay(d: Date = new Date()): number {
  const m = new Date(d.getTime() + MSK_MS);
  return m.getUTCHours() * 60 + m.getUTCMinutes();
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Хранимая дата без времени: полночь UTC нужного дня. */
export function dayStart(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function formatDateRu(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function formatDateTimeRu(d: Date): string {
  return new Date(d.getTime() + MSK_MS).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
