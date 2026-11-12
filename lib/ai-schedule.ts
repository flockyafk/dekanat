import { WEEKDAYS_FULL, addDays, formatDateRu, isoWeek, weekdayOf } from "@/lib/time";

/*
 * Вопросы о расписании на день недели, «сегодня», «завтра», «послезавтра» и конкретную дату разбирает КОД,
 * а не модель: модель плохо считает дни недели и чётность недель (так она однажды ответила «пар нет»
 * в понедельник, когда пары были). Код находит дату, берёт пары студента из базы (с чётностью недели,
 * переносами и отменами) и передаёт модели готовый список. Модель только формулирует ответ.
 * Модуль чистый: без обращений к базе и без server-only, поэтому его легко проверять тестами.
 */

const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

// \b в JavaScript не понимает кириллицу, поэтому границы слов заданы через lookbehind и lookahead
const NOT_LETTER_BEFORE = "(?<![а-яё])";
const NOT_LETTER_AFTER = "(?![а-яё])";

const WEEKDAY_PATTERNS: [RegExp, number][] = [
  [new RegExp(`${NOT_LETTER_BEFORE}понедельник[а-яё]*`), 1],
  [new RegExp(`${NOT_LETTER_BEFORE}вторник[а-яё]*`), 2],
  [new RegExp(`${NOT_LETTER_BEFORE}сред(?:а|у|ы|е|ой)${NOT_LETTER_AFTER}`), 3], // «средний балл» сюда не попадает
  [new RegExp(`${NOT_LETTER_BEFORE}четверг[а-яё]*`), 4],
  [new RegExp(`${NOT_LETTER_BEFORE}пятниц[а-яё]*`), 5],
  [new RegExp(`${NOT_LETTER_BEFORE}суббот[а-яё]*`), 6],
  [new RegExp(`${NOT_LETTER_BEFORE}воскресень[а-яё]*`), 7],
];

// Вопросы про другое, где дата это только уточнение (дедлайн в пятницу, экзамен в понедельник и т. п.)
// модель разбирает по общему контексту, а не по списку пар.
const OTHER_TOPIC = /долг|оценк|балл|экзамен|зач[её]т|дедлайн|срок|справк|заявк|заявлен|статус|объявлен|уведомлен|стипенд|общежит|погод|оплат|стоит/;

/** Совсем короткие вопросы без даты: «расписание», «какие у меня пары» = сегодня. */
const PLAIN_SCHEDULE = /^\s*(?:(?:покажи|скажи|расскажи|какое|какие|что за)\s+)?(?:у меня\s+)?(?:моё\s+|мое\s+)?(?:расписание|пары|что у меня сейчас)\s*(?:сейчас)?[?!. ]*$/;

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === key ? key : null;
}

/** Ближайшая дата с таким днём и месяцем: в этом году, если она не раньше сегодняшней, иначе в следующем. */
function nearestDayMonth(d: number, m: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  const thisYear = validDate(year, m, d);
  if (thisYear && thisYear >= today) return thisYear;
  return validDate(year + 1, m, d);
}

/** Ближайший БУДУЩИЙ день недели (строго после сегодняшнего). */
function nextWeekday(weekday: number, today: string): string {
  const diff = ((weekday - weekdayOf(today) + 7) % 7) || 7;
  return addDays(today, diff);
}

/**
 * Даты, о расписании которых спрашивает студент (не больше трёх). Пустой список означает,
 * что вопрос не про расписание на конкретный день, и модель отвечает по общему контексту.
 * today это дата по Москве вида ГГГГ-ММ-ДД.
 */
export function resolveScheduleDates(question: string, today: string): string[] {
  const q = question.toLowerCase().replace(/ё/g, "е");
  if (OTHER_TOPIC.test(q.replace(/ё/g, "е"))) return [];

  const found: string[] = [];
  const add = (key: string | null) => {
    if (key && !found.includes(key)) found.push(key);
  };

  // конкретные даты: 2026-11-16, 16.11, 16.11.2026, «16 ноября», «23 декабря 2026»
  for (const m of q.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) add(validDate(+m[1], +m[2], +m[3]));
  for (const m of q.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?![\d.])/g)) {
    add(m[3] ? validDate(+m[3], +m[2], +m[1]) : nearestDayMonth(+m[1], +m[2], today));
  }
  for (const m of q.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${Object.keys(MONTHS).join("|")})(?:\\s+(\\d{4}))?`, "g"))) {
    add(m[3] ? validDate(+m[3], MONTHS[m[2]], +m[1]) : nearestDayMonth(+m[1], MONTHS[m[2]], today));
  }

  // относительные дни
  if (new RegExp(`${NOT_LETTER_BEFORE}сегодня`).test(q)) add(today);
  if (new RegExp(`${NOT_LETTER_BEFORE}завтра`).test(q)) add(addDays(today, 1));
  if (/послезавтра/.test(q)) add(addDays(today, 2));

  // дни недели
  for (const [re, weekday] of WEEKDAY_PATTERNS) if (re.test(q)) add(nextWeekday(weekday, today));

  if (found.length === 0 && PLAIN_SCHEDULE.test(q)) add(today);

  // только разумный диапазон: год назад и год вперёд
  const inRange = found.filter((d) => d >= addDays(today, -366) && d <= addDays(today, 366));
  return inRange.slice(0, 3);
}

/** Пояснение к дате: «завтра (четверг, 12 ноября, нижняя неделя)» или «понедельник, 16 ноября (верхняя неделя)». */
export function describeDate(date: string, today: string): string {
  const weekday = WEEKDAYS_FULL[weekdayOf(date) % 7].toLowerCase();
  const week = isoWeek(date) % 2 === 1 ? "верхняя неделя" : "нижняя неделя";
  const rel = date === today ? "сегодня" : date === addDays(today, 1) ? "завтра" : date === addDays(today, 2) ? "послезавтра" : null;
  return rel ? `${rel} (${weekday}, ${formatDateRu(date)}, ${week})` : `${weekday}, ${formatDateRu(date)} (${week})`;
}
