// Демо-данные, привязанные к календарю: переносы, замены и отмены пар, дедлайны.
// Пересоздаются при каждом старте контейнера, но заданы ФИКСИРОВАННЫМИ календарными датами, а не «от сегодня»:
// после любого перезапуска и деплоя они те же, ничего не плывёт. (Раньше дедлайны считались от дня запуска
// контейнера: 11 ноября срок был «14 ноября», после перезапуска 12 ноября стал «15 ноября».)
// Пользователей, заявки, оценки и экзамены это не трогает.
//
// Окно видимости: переносы заданы на 9 ноября - 13 декабря, дедлайны разложены так, что в любом семидневном окне
// с 12 ноября по 4 декабря (в том числе на всё время проверки 21-28 ноября) есть хотя бы один будущий срок.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, dayStart, weekParityOf, weekdayOf } from "../lib/time";

/** Срок 18:00 по Москве (15:00 UTC) в указанную дату. */
const at18 = (date: string) => new Date(`${date}T15:00:00Z`);

type DeadlineSpec = { group: string; course: string; title: string; date: string };

export const DEMO_DEADLINES: DeadlineSpec[] = [
  // Группа МО-231
  { group: "МО-231", course: "Теория международных отношений", title: "Сдать эссе по ТМО", date: "2026-11-14" },
  { group: "МО-231", course: "Деловой английский", title: "Тест по деловому английскому", date: "2026-11-18" },
  { group: "МО-231", course: "Мировая экономика", title: "Реферат по мировой экономике", date: "2026-11-23" },
  { group: "МО-231", course: "Теория международных отношений", title: "Контрольная по ТМО", date: "2026-11-26" },
  { group: "МО-231", course: "Деловой английский", title: "Эссе по деловому английскому", date: "2026-11-30" },
  { group: "МО-231", course: "Мировая экономика", title: "Доклад по мировой экономике", date: "2026-12-03" },
  { group: "МО-231", course: "Теория международных отношений", title: "Итоговое эссе по ТМО", date: "2026-12-07" },
  // Группа МЭО-232 (названия отличаются, чтобы данные групп было видно сразу)
  { group: "МЭО-232", course: "Статистика", title: "Лабораторная 2 по статистике", date: "2026-11-16" },
  { group: "МЭО-232", course: "Деловой английский", title: "Презентация на английском", date: "2026-11-20" },
  { group: "МЭО-232", course: "Мировая экономика", title: "Кейс по мировой экономике", date: "2026-11-24" },
  { group: "МЭО-232", course: "Статистика", title: "Лабораторная 3 по статистике", date: "2026-11-27" },
  { group: "МЭО-232", course: "Деловой английский", title: "Письмо партнёру на английском", date: "2026-12-01" },
  { group: "МЭО-232", course: "Мировая экономика", title: "Анализ рынка для курса экономики", date: "2026-12-04" },
  { group: "МЭО-232", course: "Статистика", title: "Итоговая работа по статистике", date: "2026-12-08" },
];

const CHANGES_FROM = "2026-11-09";
const CHANGES_TO = "2026-12-13";

// Что меняется в первой паре дня: по дням недели, чтобы в любой будни у жюри был перенос, отмена или замена.
const WEEKDAY_CHANGE: Record<number, "замена аудитории" | "перенос" | "отмена"> = {
  1: "замена аудитории",
  2: "перенос",
  3: "замена аудитории",
  4: "отмена",
  5: "перенос",
};
const COMMENT = {
  "замена аудитории": "Ремонт в аудитории",
  перенос: "По просьбе преподавателя",
  отмена: "Преподаватель на конференции",
} as const;

/**
 * Пятый тестовый аккаунт: student4. В отличие от остальных, у него смена пароля РАЗРЕШЕНА (его нет в DEMO_LOGINS),
 * чтобы жюри могло проверить смену пароля. Чтобы после проверки вход всегда работал, при каждом старте
 * контейнера пароль возвращается к демо-значению, а открытые сессии этого аккаунта закрываются.
 */
export const SPARE_LOGIN = "student4";
export const SPARE_PASSWORD = "demo-student-4";

export async function ensureSpareStudent(prisma: PrismaClient) {
  const existing = await prisma.user.findUnique({ where: { login: SPARE_LOGIN } });
  if (existing) {
    if (!(await bcrypt.compare(SPARE_PASSWORD, existing.passwordHash))) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: existing.id }, data: { passwordHash: bcrypt.hashSync(SPARE_PASSWORD, 10) } }),
        prisma.session.deleteMany({ where: { userId: existing.id } }),
      ]);
    }
    return;
  }
  const group = await prisma.group.findFirst({ where: { name: "МЭО-232" } });
  if (!group) {
    console.warn("student4 не создан: нет группы МЭО-232");
    return;
  }
  const courses = await prisma.course.findMany({ where: { title: { in: ["Деловой английский", "Мировая экономика"] } } });
  const user = await prisma.user.create({
    data: {
      login: SPARE_LOGIN,
      passwordHash: bcrypt.hashSync(SPARE_PASSWORD, 10),
      role: "student",
      profile: {
        create: {
          fullName: "Кузнецов Илья Андреевич",
          faculty: "Международных экономических отношений",
          direction: "Экономика",
          course: 3,
          groupId: group.id,
          recordBook: "Т-23104",
          email: "ilya.kuznetsov@example.test",
        },
      },
    },
  });
  await prisma.enrollment.createMany({ data: courses.map((c) => ({ studentId: user.id, courseId: c.id })) });
}

export async function refreshDemoDates(prisma: PrismaClient) {
  const groups = await prisma.group.findMany();
  if (groups.length === 0) return;
  await ensureSpareStudent(prisma);

  // Изменения расписания на каждый будний день окна. Пары группы читаются один раз, вставка одним запросом.
  const lessons = await prisma.lesson.findMany({ orderBy: { slot: "asc" } });
  const changes: {
    lessonId: string;
    date: Date;
    kind: string;
    newRoom: string | null;
    newSlot: number | null;
    comment: string;
  }[] = [];
  for (let day = CHANGES_FROM; day <= CHANGES_TO; day = addDays(day, 1)) {
    const kind = WEEKDAY_CHANGE[weekdayOf(day)];
    if (!kind) continue; // суббота и воскресенье без пар
    const parity = weekParityOf(day);
    for (const g of groups) {
      const lesson = lessons.find(
        (l) => l.groupId === g.id && l.weekday === weekdayOf(day) && (l.weekParity === "both" || l.weekParity === parity),
      );
      if (!lesson) continue;
      changes.push({
        lessonId: lesson.id,
        date: dayStart(day),
        kind,
        newRoom: kind === "замена аудитории" ? "Актовый зал" : null,
        newSlot: kind === "перенос" ? Math.min(lesson.slot + 3, 6) : null,
        comment: COMMENT[kind],
      });
    }
  }

  // Дедлайны на фиксированные даты
  const courses = await prisma.course.findMany();
  const deadlines = DEMO_DEADLINES.flatMap((spec) => {
    const group = groups.find((g) => g.name === spec.group);
    const course = courses.find((c) => c.title === spec.course);
    return group && course ? [{ courseId: course.id, groupId: group.id, title: spec.title, dueAt: at18(spec.date) }] : [];
  });

  // Удаление и создание одной транзакцией: ни на секунду не остаётся «пустого» расписания и дедлайнов.
  // Заметка: пересоздаются ВСЕ переносы и дедлайны. Создавать их на сайте сейчас нельзя (сотрудник публикует только
  // объявления), поэтому созданных вручную записей нет. Если появится, исключить их из очистки.
  await prisma.$transaction([
    prisma.lessonChange.deleteMany(),
    prisma.deadline.deleteMany(),
    prisma.lessonChange.createMany({ data: changes }),
    prisma.deadline.createMany({ data: deadlines }),
  ]);
}

// Запуск напрямую: npx tsx prisma/refresh-demo.ts
if (process.argv[1]?.endsWith("refresh-demo.ts")) {
  const prisma = new PrismaClient();
  refreshDemoDates(prisma)
    .then(() => console.log("Демо-даты обновлены (фиксированные календарные даты)."))
    .finally(() => prisma.$disconnect());
}
