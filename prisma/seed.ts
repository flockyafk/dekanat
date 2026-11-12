// Вымышленные данные. Реальных людей, оценок и номеров здесь нет.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { refreshDemoDates } from "./refresh-demo";

const prisma = new PrismaClient();
// Даты сида ФИКСИРОВАННЫЕ: отсчёт от 11 ноября 2026 (12:00 по Москве), а не от дня заполнения базы.
// Так оценки, экзамены и результаты не «плывут» и одинаковы при любом деплое. Дедлайны и переносы пар лежат
// в prisma/refresh-demo.ts и тоже заданы календарными датами.
const SEED_BASE = new Date("2026-11-11T09:00:00Z");
const day = (offset: number) => new Date(SEED_BASE.getTime() + offset * 24 * 60 * 60 * 1000);

async function main() {
  // Сид стирает все таблицы. При SEED_ONLY_IF_EMPTY=1 (его ставит docker-entrypoint.sh)
  // он работает только на пустой базе, иначе перезапуск контейнера уничтожил бы заявки студентов.
  if (process.env.SEED_ONLY_IF_EMPTY === "1" && (await prisma.user.count()) > 0) {
    console.log("Сид пропущен: база уже заполнена.");
    return;
  }

  // Чистим всё, сид можно запускать повторно
  await prisma.$transaction([
    prisma.notificationRead.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.requestEvent.deleteMany(),
    prisma.request.deleteMany(),
    prisma.aiUsage.deleteMany(),
    prisma.loginAttempt.deleteMany(),
    prisma.session.deleteMany(),
    prisma.deadline.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.examResult.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.lessonChange.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.studentProfile.deleteMany(),
    prisma.user.deleteMany(),
    prisma.group.deleteMany(),
  ]);

  const g1 = await prisma.group.create({ data: { name: "МО-231" } });
  const g2 = await prisma.group.create({ data: { name: "МЭО-232" } });

  const hash = (p: string) => bcrypt.hashSync(p, 10);

  const mk = async (
    login: string,
    password: string,
    p: { fullName: string; faculty: string; direction: string; course: number; groupId: string; recordBook: string; email: string },
  ) =>
    prisma.user.create({
      data: { login, passwordHash: hash(password), role: "student", profile: { create: p } },
    });

  const s1 = await mk("student1", "demo-student-1", {
    fullName: "Иванова Анна Сергеевна", faculty: "Международных отношений", direction: "Международные отношения",
    course: 3, groupId: g1.id, recordBook: "Т-23001", email: "anna.ivanova@example.test",
  });
  const s2 = await mk("student2", "demo-student-2", {
    fullName: "Петров Максим Олегович", faculty: "Международных отношений", direction: "Международные отношения",
    course: 3, groupId: g1.id, recordBook: "Т-23002", email: "maxim.petrov@example.test",
  });
  const s3 = await mk("student3", "demo-student-3", {
    fullName: "Соколова Дарья Игоревна", faculty: "Международных экономических отношений", direction: "Экономика",
    course: 3, groupId: g2.id, recordBook: "Т-23103", email: "darya.sokolova@example.test",
  });
  const staff = await prisma.user.create({
    data: { login: "staff", passwordHash: hash("demo-staff-1"), role: "staff" },
  });

  const mkCourse = (title: string, teacher: string, control: string) =>
    prisma.course.create({ data: { title, teacher, control, semester: 5 } });
  const c1 = await mkCourse("Теория международных отношений", "Громов В. А.", "экзамен");
  const c2 = await mkCourse("Деловой английский", "Лебедева Н. П.", "зачёт");
  const c3 = await mkCourse("Мировая экономика", "Крылов Д. С.", "экзамен");
  const c4 = await mkCourse("Статистика", "Орлова Е. М.", "зачёт");

  const enroll = (studentId: string, courses: { id: string }[]) =>
    prisma.enrollment.createMany({ data: courses.map((c) => ({ studentId, courseId: c.id })) });
  await enroll(s1.id, [c1, c2, c3]);
  await enroll(s2.id, [c1, c2, c3]);
  await enroll(s3.id, [c2, c3, c4]);

  // Расписание: у групп разное
  const L = (groupId: string, courseId: string, weekday: number, slot: number, weekParity: string, room: string, kind: string) =>
    ({ groupId, courseId, weekday, slot, weekParity, room, kind });
  // Группа 1 (МО-231): понедельник-пятница. Группа 2 (МЭО-232): другой набор и другие дни.
  await prisma.lesson.createMany({
    data: [
      L(g1.id, c1.id, 1, 1, "both", "301", "лекция"),
      L(g1.id, c2.id, 1, 2, "both", "412", "семинар"),
      L(g1.id, c3.id, 2, 2, "upper", "215", "лекция"),
      L(g1.id, c3.id, 2, 2, "lower", "216", "семинар"),
      L(g1.id, c1.id, 3, 1, "both", "305", "семинар"),
      L(g1.id, c2.id, 3, 3, "both", "412", "практика"),
      L(g1.id, c3.id, 4, 2, "both", "215", "лекция"),
      L(g1.id, c1.id, 4, 3, "both", "301", "семинар"),
      L(g1.id, c2.id, 5, 1, "upper", "412", "семинар"),
      L(g1.id, c3.id, 5, 2, "both", "216", "практика"),
      L(g2.id, c3.id, 1, 2, "both", "210", "лекция"),
      L(g2.id, c4.id, 2, 1, "both", "118", "практика"),
      L(g2.id, c2.id, 3, 3, "both", "414", "семинар"),
      L(g2.id, c3.id, 4, 1, "both", "210", "семинар"),
      L(g2.id, c4.id, 4, 4, "both", "118", "лекция"),
      L(g2.id, c2.id, 5, 2, "both", "414", "практика"),
    ],
  });

  const gr = (studentId: string, courseId: string, title: string, score: number, ago: number) =>
    ({ studentId, courseId, title, score, date: day(-ago) });
  await prisma.grade.createMany({
    data: [
      gr(s1.id, c1.id, "Контрольная 1", 82, 30), gr(s1.id, c1.id, "Эссе", 74, 12),
      gr(s1.id, c2.id, "Тест 1", 91, 20), gr(s1.id, c3.id, "Контрольная 1", 55, 15),
      gr(s2.id, c1.id, "Контрольная 1", 64, 30), gr(s2.id, c2.id, "Тест 1", 48, 20),
      gr(s2.id, c3.id, "Контрольная 1", 77, 15),
      gr(s3.id, c2.id, "Тест 1", 88, 20), gr(s3.id, c3.id, "Контрольная 1", 69, 15),
      gr(s3.id, c4.id, "Лабораторная 1", 95, 10),
    ],
  });

  await prisma.examResult.createMany({
    data: [
      { studentId: s1.id, courseId: c1.id, date: day(25), status: "назначено" },
      { studentId: s1.id, courseId: c2.id, date: day(20), status: "назначено" },
      { studentId: s2.id, courseId: c2.id, date: day(-5), status: "не сдано", result: "незачёт" },
      { studentId: s1.id, courseId: c3.id, date: day(28), status: "назначено" },
      { studentId: s2.id, courseId: c1.id, date: day(26), status: "назначено" },
      { studentId: s3.id, courseId: c4.id, date: day(22), status: "назначено" },
      { studentId: s3.id, courseId: c2.id, date: day(-3), status: "сдано", result: "зачтено" },
    ],
  });

  // Посещаемость: held занятий проведено, attended посещено. У студентов разная.
  const at = (studentId: string, courseId: string, held: number, attended: number) => ({ studentId, courseId, held, attended });
  await prisma.attendance.createMany({
    data: [
      at(s1.id, c1.id, 14, 13), at(s1.id, c2.id, 14, 14), at(s1.id, c3.id, 14, 9),
      at(s2.id, c1.id, 14, 14), at(s2.id, c2.id, 14, 8), at(s2.id, c3.id, 14, 12),
      at(s3.id, c2.id, 14, 14), at(s3.id, c3.id, 14, 13), at(s3.id, c4.id, 14, 11),
    ],
  });

  // Дедлайны и переносы пар зависят от текущей даты, их создаёт refreshDemoDates
  await refreshDemoDates(prisma);

  const r1 = await prisma.request.create({
    data: {
      studentId: s1.id, type: "Справка об обучении", text: "Нужна справка для банка.",
      status: "В работе",
      events: {
        create: [
          { status: "Отправлена", author: "student1" },
          { status: "В работе", comment: "Принято, готовим.", author: "staff" },
        ],
      },
    },
  });
  await prisma.request.create({
    data: {
      studentId: s2.id, type: "Заявление на пересдачу", text: "Прошу назначить пересдачу зачёта по английскому.",
      events: { create: [{ status: "Отправлена", author: "student2" }] },
    },
  });

  await prisma.notification.createMany({
    data: [
      { audience: "all", kind: "объявление", title: "Приём справок в пятницу", body: "Деканат принимает заявки до 16:00.", link: "/requests" },
      { audience: "group", groupId: g1.id, kind: "расписание", title: "Перенос пары", body: "Семинар по ТМО в среду перенесён.", link: "/schedule" },
      { audience: "student", studentId: s1.id, kind: "заявка", title: "Заявка в работе", body: "Справка об обучении принята в работу.", link: `/requests/${r1.id}` },
      { audience: "group", groupId: g1.id, kind: "дедлайн", title: "Эссе по ТМО", body: "Срок сдачи эссе: 14 ноября, 18:00.", link: "/grades" },
      { audience: "group", groupId: g2.id, kind: "дедлайн", title: "Лабораторная 2 по статистике", body: "Срок сдачи лабораторной: 16 ноября, 18:00.", link: "/grades" },
    ],
  });

  console.log("Сид готов. Студенты:", s1.login, s2.login, s3.login, "сотрудник:", staff.login);
}

main().finally(() => prisma.$disconnect());
