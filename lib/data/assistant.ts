import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/data/profile";
import { getMyLessonsOn } from "@/lib/data/schedule";
import { getMyCourses, getMySession } from "@/lib/data/grades";
import { getMyLatestAnnouncements } from "@/lib/data/notifications";
import { getMyRequest, listMyRequests } from "@/lib/data/requests";
import { WEEKDAYS_FULL, addDays, dateKey, weekdayOf } from "@/lib/time";

const DAY_MS = 24 * 60 * 60 * 1000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Контекст для модели. Собирается ТОЛЬКО из данных текущего студента из сессии:
 * каждая использованная функция сама фильтрует по user.id. Данные других студентов сюда не попадают.
 */
export async function getAssistantContext(user: CurrentUser, now: Date = new Date()) {
  const today = dateKey(now);
  const [profile, courses, session, announcements, requestList] = await Promise.all([
    getMyProfile(user),
    getMyCourses(user),
    getMySession(user),
    getMyLatestAnnouncements(user, 5),
    listMyRequests(user),
  ]);

  // Пары на сегодня, завтра и послезавтра: хватает для вопроса «что у меня завтра»
  const days = [] as { date: string; weekday: string; lessons: unknown[] }[];
  for (let i = 0; i < 3; i++) {
    const date = addDays(today, i);
    const lessons = await getMyLessonsOn(user, date);
    days.push({
      date,
      weekday: WEEKDAYS_FULL[weekdayOf(date) % 7],
      lessons: lessons.map((l) => ({
        start: l.start,
        end: l.end,
        title: l.title,
        kind: l.kind,
        room: l.room,
        teacher: l.teacher,
        cancelled: l.cancelled,
        change: l.change ? `${l.change.text}${l.change.comment ? ` (${l.change.comment})` : ""}` : null,
      })),
    });
  }

  // Дедлайны на 14 дней: по моим дисциплинам или по моей группе
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true } });
  const deadlines = await prisma.deadline.findMany({
    where: {
      dueAt: { gte: now, lte: new Date(now.getTime() + 14 * DAY_MS) },
      OR: [
        { courseId: { in: enrollments.map((e) => e.courseId) } },
        ...(profile ? [{ groupId: profile.groupId }] : []),
      ],
    },
    orderBy: { dueAt: "asc" },
    include: { course: { select: { title: true } } },
  });

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
    days,
    deadlines: deadlines.map((d) => ({
      title: d.title,
      course: d.course?.title ?? null,
      due: dateKey(d.dueAt),
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

/** Сколько запросов к ИИ у студента уже потрачено сегодня (только число). */
export async function getMyAiUsageToday(user: CurrentUser, day: string): Promise<number> {
  const row = await prisma.aiUsage.findUnique({ where: { userId_date: { userId: user.id, date: day } } });
  return row?.count ?? 0;
}
