import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

// Порог зоны риска (прототип): средний балл по дисциплине ниже 60 или посещаемость ниже 70%.
export const RISK_SCORE = 60;
export const RISK_ATTENDANCE = 70;

export type CourseRow = {
  id: string;
  title: string;
  teacher: string;
  control: string;
  average: number | null;
  worksCount: number;
  attendancePct: number | null;
  atRisk: boolean;
  riskReasons: string[];
  debt: boolean;
};

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const pct = (attended: number, held: number) => (held > 0 ? Math.round((attended / held) * 100) : null);

/** Дисциплины текущего семестра студента с баллом, посещаемостью и признаком риска. */
export async function getMyCourses(user: CurrentUser): Promise<CourseRow[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: user.id },
    include: { course: true },
    orderBy: { course: { title: "asc" } },
  });
  const courseIds = enrollments.map((e) => e.courseId);

  const [grades, attendance, debts] = await Promise.all([
    prisma.grade.findMany({ where: { studentId: user.id, courseId: { in: courseIds } }, select: { courseId: true, score: true } }),
    prisma.attendance.findMany({ where: { studentId: user.id, courseId: { in: courseIds } } }),
    prisma.examResult.findMany({ where: { studentId: user.id, status: "не сдано" }, select: { courseId: true } }),
  ]);

  return enrollments.map(({ course }): CourseRow => {
    const average = mean(grades.filter((g) => g.courseId === course.id).map((g) => g.score));
    const att = attendance.find((a) => a.courseId === course.id);
    const attendancePct = att ? pct(att.attended, att.held) : null;
    const debt = debts.some((d) => d.courseId === course.id);

    const riskReasons: string[] = [];
    if (average !== null && average < RISK_SCORE) riskReasons.push("низкий балл");
    if (attendancePct !== null && attendancePct < RISK_ATTENDANCE) riskReasons.push("много пропусков");
    if (debt) riskReasons.push("долг");

    return {
      id: course.id,
      title: course.title,
      teacher: course.teacher,
      control: course.control,
      average,
      worksCount: grades.filter((g) => g.courseId === course.id).length,
      attendancePct,
      atRisk: riskReasons.length > 0,
      riskReasons,
      debt,
    };
  });
}

/** Карточка дисциплины. Если студент на неё не записан, возвращает null (страница отдаёт 404). */
export async function getMyCourse(user: CurrentUser, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId: user.id, courseId } },
    include: { course: true },
  });
  if (!enrollment) return null;

  const [grades, attendance, exams] = await Promise.all([
    prisma.grade.findMany({ where: { studentId: user.id, courseId }, orderBy: { date: "desc" } }),
    prisma.attendance.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } } }),
    prisma.examResult.findMany({ where: { studentId: user.id, courseId }, orderBy: { date: "asc" } }),
  ]);

  return {
    id: enrollment.course.id,
    title: enrollment.course.title,
    teacher: enrollment.course.teacher,
    control: enrollment.course.control,
    average: mean(grades.map((g) => g.score)),
    grades: grades.map((g) => ({ id: g.id, title: g.title, score: g.score, maxScore: g.maxScore, date: g.date })),
    attendance: attendance
      ? { held: attendance.held, attended: attendance.attended, pct: pct(attendance.attended, attendance.held) }
      : null,
    exams: exams.map((e) => ({ id: e.id, date: e.date, status: e.status, result: e.result })),
  };
}

/** Блок «Сессия»: даты зачётов и экзаменов, результаты и долги. */
export async function getMySession(user: CurrentUser) {
  const rows = await prisma.examResult.findMany({
    where: { studentId: user.id },
    include: { course: { select: { id: true, title: true, control: true } } },
    orderBy: { date: "asc" },
  });
  const items = rows.map((r) => ({
    id: r.id,
    courseId: r.course.id,
    title: r.course.title,
    control: r.course.control,
    date: r.date,
    status: r.status,
    result: r.result,
  }));
  return {
    upcoming: items.filter((i) => i.status === "назначено"),
    results: items.filter((i) => i.status !== "назначено"),
    debts: items.filter((i) => i.status === "не сдано"),
  };
}

/** Сводка «как у меня дела»: средний балл, число долгов, дисциплины в зоне риска. */
export async function getMyStanding(user: CurrentUser) {
  const [courses, grades, debts] = await Promise.all([
    getMyCourses(user),
    prisma.grade.findMany({ where: { studentId: user.id }, select: { score: true } }),
    prisma.examResult.count({ where: { studentId: user.id, status: "не сдано" } }),
  ]);
  return {
    average: mean(grades.map((g) => g.score)),
    debts,
    atRisk: courses.filter((c) => c.atRisk).map((c) => ({ id: c.id, title: c.title, reasons: c.riskReasons })),
  };
}
