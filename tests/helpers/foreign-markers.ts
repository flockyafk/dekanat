import type { PrismaClient } from "@prisma/client";

/**
 * Всё, что принадлежит только другим студентам: имена, почты, зачётки, id записей, тексты заявок,
 * дисциплины, на которые студент не записан, чужие дедлайны, комментарии, результаты, чужие уведомления.
 * Если что-то из этого найдено в запросе к модели или в ответе, это утечка.
 */
export async function foreignMarkers(prisma: PrismaClient, login: string): Promise<string[]> {
  const me = await prisma.user.findUniqueOrThrow({ where: { login } });
  const others = await prisma.user.findMany({ where: { id: { not: me.id }, role: "student" }, include: { profile: true } });
  const markers: string[] = [];
  for (const o of others) {
    markers.push(o.id, o.login);
    if (o.profile) markers.push(o.profile.fullName, o.profile.email, o.profile.recordBook);
    for (const g of await prisma.grade.findMany({ where: { studentId: o.id } })) markers.push(g.id);
    for (const e of await prisma.examResult.findMany({ where: { studentId: o.id } })) markers.push(e.id);
    for (const r of await prisma.request.findMany({ where: { studentId: o.id } })) markers.push(r.id, r.text);
  }
  // уведомления, адресованные не мне
  const myProfile = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: me.id } });
  const foreignNotes = await prisma.notification.findMany({
    where: {
      OR: [
        { audience: "student", studentId: { not: me.id } },
        { audience: "group", groupId: { not: myProfile.groupId } },
      ],
    },
  });
  for (const n of foreignNotes) markers.push(n.id, n.title, n.body);
  // название чужой группы, если она отличается от моей
  for (const g of await prisma.group.findMany({ where: { id: { not: myProfile.groupId } } })) markers.push(g.name);

  // дисциплины, на которые я не записан, и всё, что с ними связано (оценки, дедлайны)
  const myCourseIds = (await prisma.enrollment.findMany({ where: { studentId: me.id } })).map((e) => e.courseId);
  const foreignCourses = await prisma.course.findMany({ where: { id: { notIn: myCourseIds } } });
  for (const c of foreignCourses) markers.push(c.id, c.title);
  for (const g of await prisma.grade.findMany({ where: { courseId: { notIn: myCourseIds }, studentId: { not: me.id } } })) {
    markers.push(g.title);
  }
  // Чужой дедлайн: у него есть группа, и это не моя (даже по общей дисциплине), либо группы нет и дисциплина не моя
  const foreignDeadlines = await prisma.deadline.findMany({
    where: {
      OR: [
        { groupId: { not: myProfile.groupId } }, // не пустая и не моя группа
        { groupId: null, courseId: { notIn: myCourseIds } },
      ],
    },
  });
  for (const d of foreignDeadlines) markers.push(d.id, d.title);

  // комментарии деканата и результаты экзаменов других студентов
  for (const ev of await prisma.requestEvent.findMany({ where: { request: { studentId: { not: me.id } } } })) {
    if (ev.comment) markers.push(ev.comment);
  }
  for (const ex of await prisma.examResult.findMany({ where: { studentId: { not: me.id } } })) {
    if (ex.result) markers.push(ex.result);
  }
  // убираем значения, которые есть и у меня (общие дисциплины и т.п.), чтобы не было ложных срабатываний
  const mine = [
    ...(await prisma.course.findMany({ where: { id: { in: myCourseIds } } })).map((c) => c.title),
    ...(await prisma.requestEvent.findMany({ where: { request: { studentId: me.id } } })).map((e) => e.comment ?? ""),
    ...(await prisma.examResult.findMany({ where: { studentId: me.id } })).map((e) => e.result ?? ""),
  ];
  return [...new Set(markers)].filter((m) => m && m.length >= 5 && !mine.includes(m));
}
