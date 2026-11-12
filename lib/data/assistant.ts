import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/data/profile";
import { getMyLessonsOn, type LessonView } from "@/lib/data/schedule";
import { describeDate, resolveScheduleDates } from "@/lib/ai-schedule";
import { getMyCourses, getMySession } from "@/lib/data/grades";
import { getMyLatestAnnouncements } from "@/lib/data/notifications";
import { getMyRequest, listMyRequests } from "@/lib/data/requests";
import { getMyDeadlines } from "@/lib/data/deadlines";
import { WEEKDAYS_FULL, addDays, dateKey, formatDateTimeRu, isoWeek, weekdayOf } from "@/lib/time";

const DAY_MS = 24 * 60 * 60 * 1000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Пара одной строкой: «10:40–12:10 Мировая экономика, лекция, ауд. 215, Крылов Д. С. ОТМЕНЕНА (причина)». */
function lessonLine(l: LessonView): string {
  const base = `${l.start}-${l.end} ${l.title}, ${l.kind}, ауд. ${l.room}, ${l.teacher}`; // диапазон времени через дефис, без длинного тире
  if (l.cancelled) return `${base}. ОТМЕНЕНА${l.change?.comment ? ` (${l.change.comment})` : ""}`;
  if (l.change) return `${base}. ${l.change.text}${l.change.comment ? ` (${l.change.comment})` : ""}`;
  return base;
}

/**
 * Контекст для модели. Собирается ТОЛЬКО из данных текущего студента из сессии:
 * каждая использованная функция сама фильтрует по user.id. Данные других студентов сюда не попадают.
 */
export async function getAssistantContext(user: CurrentUser, now: Date = new Date(), question?: string) {
  const today = dateKey(now);
  const [profile, courses, session, announcements, requestList] = await Promise.all([
    getMyProfile(user),
    getMyCourses(user),
    getMySession(user),
    getMyLatestAnnouncements(user, 5),
    listMyRequests(user),
  ]);

  // Расписание на ближайшие 14 дней по датам. День без пар передаётся явно: «lessons: []» значит «пар нет»,
  // а не «данных нет». Пары берутся из расписания группы студента с учётом чётности недели и изменений.
  const schedule = [] as { date: string; weekday: string; week: string; lessons: string[] }[];
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i);
    schedule.push({
      date,
      weekday: WEEKDAYS_FULL[weekdayOf(date) % 7],
      week: isoWeek(date) % 2 === 1 ? "верхняя" : "нижняя",
      lessons: (await getMyLessonsOn(user, date)).map(lessonLine),
    });
  }

  // Вопросы о расписании на день недели, «сегодня», «завтра» или дату считает код: модель получает готовый
  // список «Пары на <дата>: …» или явное «пар нет» и только формулирует ответ.
  const scheduleAnswer: { date: string; text: string }[] = [];
  for (const date of question ? resolveScheduleDates(question, today) : []) {
    const lessons = await getMyLessonsOn(user, date);
    const head = `Пары на ${describeDate(date, today)}`;
    scheduleAnswer.push({
      date,
      text:
        lessons.length === 0
          ? `${head}: пар нет.`
          : `${head}: ${lessons.map((l, i) => `${i + 1}) ${lessonLine(l)}`).join("; ")}.`,
    });
  }

  // Дедлайны на 14 дней: по моей группе или по моим дисциплинам (правило в lib/data/deadlines.ts)
  const deadlines = await getMyDeadlines(user, now, new Date(now.getTime() + 14 * DAY_MS));

  const requests = [];
  for (const r of requestList.slice(0, 10)) {
    const full = await getMyRequest(user, r.id); // повторно проверяет владельца
    if (!full) continue;
    const lastComment = [...full.events].reverse().find((e) => e.comment && !e.byMe)?.comment ?? null;
    requests.push({
      id: full.id,
      type: full.type,
      status: full.status,
      text: clip(full.text, 300),
      deanComment: lastComment ? clip(lastComment, 300) : null,
    });
  }

  return {
    today: { date: today, weekday: WEEKDAYS_FULL[weekdayOf(today) % 7] },
    student: profile
      ? { name: profile.fullName, group: profile.group.name, course: profile.course, direction: profile.direction }
      : null,
    schedule,
    scheduleAnswer,
    deadlines: deadlines.map((d) => ({
      title: d.title,
      course: d.course?.title ?? null,
      due: dateKey(d.dueAt), // дата ГГГГ-ММ-ДД по Москве
      dueText: formatDateTimeRu(d.dueAt), // «14 ноября в 18:00»: дату и время называть вместе
    })),
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      control: c.control,
      teacher: c.teacher,
      average: c.average,
      attendancePercent: c.attendancePct,
      atRisk: c.atRisk,
      riskReasons: c.riskReasons,
    })),
    session: {
      upcoming: session.upcoming.map((e) => ({ title: e.title, control: e.control, date: dateKey(e.date) })),
      results: session.results.map((e) => ({ title: e.title, date: dateKey(e.date), result: e.result, status: e.status })),
      debts: session.debts.map((e) => e.title),
    },
    requests,
    announcements: announcements.map((a) => ({ title: a.title, text: clip(a.body, 300) })),
  };
}

export type AssistantContext = Awaited<ReturnType<typeof getAssistantContext>>;

/**
 * Контекст для черновика заявки: только сведения о самом студенте и его дисциплинах.
 * Собирается из данных текущего студента из сессии, заявок и оценок других студентов тут нет.
 */
export async function getDraftContext(user: CurrentUser) {
  const [profile, courses] = await Promise.all([getMyProfile(user), getMyCourses(user)]);
  return {
    student: profile
      ? { name: profile.fullName, group: profile.group.name, course: profile.course, direction: profile.direction }
      : null,
    courses: courses.map((c) => ({ title: c.title, control: c.control, debt: c.debt })),
  };
}

export type DraftContext = Awaited<ReturnType<typeof getDraftContext>>;

/** Сколько запросов к ИИ у студента уже потрачено сегодня (только число). */
export async function getMyAiUsageToday(user: CurrentUser, day: string): Promise<number> {
  const row = await prisma.aiUsage.findUnique({ where: { userId_date: { userId: user.id, date: day } } });
  return row?.count ?? 0;
}
