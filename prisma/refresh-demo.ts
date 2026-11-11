// Пересоздаёт демо-данные, которые привязаны к текущей дате: переносы и замены пар,
// дедлайны. Пользователей, заявки и оценки не трогает. Запускается при каждом старте
// контейнера, поэтому на день проверки у жюри в расписании всегда есть изменения.
import { PrismaClient } from "@prisma/client";
import { addDays, dateKey, dayStart, weekParityOf, weekdayOf } from "../lib/time";

export async function refreshDemoDates(prisma: PrismaClient) {
  const groups = await prisma.group.findMany();
  if (groups.length === 0) return;

  const today = dateKey();
  await prisma.lessonChange.deleteMany();
  await prisma.deadline.deleteMany();

  for (const g of groups) {
    // сегодня: замена аудитории у первой пары; завтра: отмена; послезавтра: перенос
    const plan = [
      { offset: 0, kind: "замена аудитории" },
      { offset: 1, kind: "отмена" },
      { offset: 2, kind: "перенос" },
    ];
    for (const { offset, kind } of plan) {
      const day = addDays(today, offset);
      const lessons = await prisma.lesson.findMany({
        where: { groupId: g.id, weekday: weekdayOf(day), weekParity: { in: ["both", weekParityOf(day)] } },
        orderBy: { slot: "asc" },
      });
      const lesson = lessons[0];
      if (!lesson) continue;
      await prisma.lessonChange.create({
        data: {
          lessonId: lesson.id,
          date: dayStart(day),
          kind,
          newRoom: kind === "замена аудитории" ? "Актовый зал" : null,
          newSlot: kind === "перенос" ? Math.min(lesson.slot + 3, 6) : null,
          comment:
            kind === "отмена" ? "Преподаватель на конференции" : kind === "перенос" ? "По просьбе преподавателя" : "Ремонт в аудитории",
        },
      });
    }
  }

  const at = (days: number, hour: number) => new Date(`${addDays(today, days)}T${String(hour - 3).padStart(2, "0")}:00:00Z`);
  const byTitle = async (title: string) => prisma.course.findFirst({ where: { title } });
  const tmo = await byTitle("Теория международных отношений");
  const stat = await byTitle("Статистика");
  const g1 = groups.find((g) => g.name === "МО-231");
  const g2 = groups.find((g) => g.name === "МЭО-232");
  if (tmo && g1) {
    await prisma.deadline.create({ data: { courseId: tmo.id, groupId: g1.id, title: "Сдать эссе по ТМО", dueAt: at(3, 18) } });
  }
  if (stat && g2) {
    await prisma.deadline.create({ data: { courseId: stat.id, groupId: g2.id, title: "Лабораторная 2 по статистике", dueAt: at(5, 18) } });
  }
}

// Запуск напрямую: npx tsx prisma/refresh-demo.ts
if (process.argv[1]?.endsWith("refresh-demo.ts")) {
  const prisma = new PrismaClient();
  refreshDemoDates(prisma)
    .then(() => console.log("Демо-даты обновлены."))
    .finally(() => prisma.$disconnect());
}
