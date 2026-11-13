import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { getMyNotifications } from "@/lib/data/notifications";
import { SLOT_TIMES, WEEKDAYS_SHORT } from "@/lib/time";

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;
const PER_GROUP = 8;

/** Запрос проверяется на сервере: строка от 2 до 60 символов после обрезки пробелов. */
export const searchQuerySchema = z.string().trim().min(SEARCH_MIN).max(SEARCH_MAX);

export type SearchHit = { id: string; title: string; subtitle: string; href: string };
export type SearchResult = {
  query: string;
  lessons: SearchHit[];
  courses: SearchHit[];
  grades: SearchHit[];
  requests: SearchHit[];
  announcements: SearchHit[];
  total: number;
};

/** Регистр не важен, «ё» и «е» считаются одной буквой. Сравнение в коде: LIKE в SQLite не знает регистра кириллицы. */
const norm = (s: string) => s.toLowerCase().replaceAll("ё", "е");
const has = (q: string, ...fields: (string | null | undefined)[]) => fields.some((f) => f && norm(f).includes(q));

const PARITY: Record<string, string> = { upper: "верхняя неделя", lower: "нижняя неделя", both: "каждую неделю" };

/**
 * Поиск по данным ТЕКУЩЕГО студента: расписание его группы, его дисциплины и оценки, его заявки, адресованные ему
 * объявления. Пользователь берётся из сессии, идентификаторов из запроса нет. Сотруднику возвращается пусто.
 */
export async function searchMine(user: CurrentUser, rawQuery: string): Promise<SearchResult> {
  const empty: SearchResult = { query: "", lessons: [], courses: [], grades: [], requests: [], announcements: [], total: 0 };
  const parsed = searchQuerySchema.safeParse(rawQuery);
  if (!parsed.success || user.role !== "student") return empty;
  const query = parsed.data;
  const q = norm(query);

  const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { groupId: true } });
  const [enrollments, grades, requests, lessons, notifications] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: user.id }, include: { course: true } }),
    prisma.grade.findMany({ where: { studentId: user.id }, include: { course: true }, orderBy: { date: "desc" } }),
    prisma.request.findMany({ where: { studentId: user.id }, orderBy: { createdAt: "desc" } }),
    profile
      ? prisma.lesson.findMany({
          where: { groupId: profile.groupId },
          include: { course: true },
          orderBy: [{ weekday: "asc" }, { slot: "asc" }],
        })
      : Promise.resolve([]),
    getMyNotifications(user, 200),
  ]);

  const result: SearchResult = {
    query,
    courses: enrollments
      .filter((e) => has(q, e.course.title, e.course.teacher))
      .slice(0, PER_GROUP)
      .map((e) => ({
        id: e.course.id,
        title: e.course.title,
        subtitle: `${e.course.teacher}, ${e.course.control}`,
        href: `/grades/${e.course.id}`,
      })),
    lessons: lessons
      .filter((l) => has(q, l.course.title, l.course.teacher, l.room, l.kind))
      .slice(0, PER_GROUP)
      .map((l) => ({
        id: l.id,
        title: l.course.title,
        subtitle: `${WEEKDAYS_SHORT[l.weekday % 7]} ${SLOT_TIMES[l.slot].start}, ${l.kind}, ${l.room}, ${PARITY[l.weekParity] ?? ""}`,
        href: "/schedule",
      })),
    grades: grades
      .filter((g) => has(q, g.title, g.course.title))
      .slice(0, PER_GROUP)
      .map((g) => ({
        id: g.id,
        title: `${g.title}: ${g.score} из ${g.maxScore}`,
        subtitle: g.course.title,
        href: `/grades/${g.courseId}`,
      })),
    requests: requests
      .filter((r) => has(q, r.type, r.text, r.status))
      .slice(0, PER_GROUP)
      .map((r) => ({ id: r.id, title: r.type, subtitle: r.status, href: `/requests/${r.id}` })),
    announcements: notifications
      .filter((n) => has(q, n.title, n.body))
      .slice(0, PER_GROUP)
      .map((n) => ({ id: n.id, title: n.title, subtitle: n.kind, href: "/notifications" })),
    total: 0,
  };
  result.total =
    result.lessons.length + result.courses.length + result.grades.length + result.requests.length + result.announcements.length;
  return result;
}
