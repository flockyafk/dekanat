import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { dateKey } from "@/lib/time";
import { getMyLessonsOn, getMyNextLesson } from "@/lib/data/schedule";
import { getMyLatestAnnouncements } from "@/lib/data/notifications";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Всё для экрана «Сегодня». Каждый запрос фильтруется по пользователю из сессии. */
export async function getTodayData(user: CurrentUser, now: Date = new Date()) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { groupId: true },
  });

  const [lessonsToday, next, announcements] = await Promise.all([
    getMyLessonsOn(user, dateKey(now)),
    getMyNextLesson(user, now),
    getMyLatestAnnouncements(user, 3),
  ]);
  const changes = lessonsToday.filter((l) => l.change);

  // Дедлайны на 7 дней: по моим дисциплинам или по моей группе
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: user.id },
    select: { courseId: true },
  });
  const deadlines = await prisma.deadline.findMany({
    where: {
      dueAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY_MS) },
      OR: [
        { courseId: { in: enrollments.map((e) => e.courseId) } },
        ...(profile ? [{ groupId: profile.groupId }] : []),
      ],
    },
    orderBy: { dueAt: "asc" },
    include: { course: { select: { title: true } } },
  });

  // Заявки, у которых статус сменился за последние 7 дней
  const requests = await prisma.request.findMany({
    where: {
      studentId: user.id,
      status: { not: "Отправлена" },
      updatedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, type: true, status: true },
  });

  // Сводка учёбы
  const grades = await prisma.grade.findMany({ where: { studentId: user.id }, select: { score: true } });
  const average = grades.length ? Math.round(grades.reduce((s, g) => s + g.score, 0) / grades.length) : null;
  const debts = await prisma.examResult.count({ where: { studentId: user.id, status: "не сдано" } });
  const exam = await prisma.examResult.findFirst({
    where: { studentId: user.id, status: "назначено", date: { gte: now } },
    orderBy: { date: "asc" },
    include: { course: { select: { title: true } } },
  });

  return {
    next,
    changes,
    deadlines: deadlines.map((d) => ({ id: d.id, title: d.title, course: d.course?.title ?? null, dueAt: d.dueAt })),
    requests,
    summary: { average, debts, exam: exam ? { title: exam.course.title, date: exam.date } : null },
    announcements,
    lessonsTodayCount: lessonsToday.filter((l) => !l.cancelled).length,
  };
}
