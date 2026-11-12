import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

/**
 * Дедлайны текущего студента в промежутке [from, to]. Правило видимости:
 * дедлайн группы виден только студентам этой группы; дедлайн без группы виден записанным на дисциплину.
 * (Раньше дедлайн группы был виден всем, кто записан на ту же дисциплину, в том числе студентам другой группы.)
 */
export async function getMyDeadlines(user: CurrentUser, from: Date, to: Date) {
  const [profile, enrollments] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { groupId: true } }),
    prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true } }),
  ]);
  return prisma.deadline.findMany({
    where: {
      dueAt: { gte: from, lte: to },
      OR: [
        ...(profile ? [{ groupId: profile.groupId }] : []),
        { groupId: null, courseId: { in: enrollments.map((e) => e.courseId) } },
      ],
    },
    orderBy: { dueAt: "asc" },
    include: { course: { select: { title: true } } },
  });
}
