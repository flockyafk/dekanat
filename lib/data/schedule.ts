import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { SLOT_TIMES, addDays, dateKey, dayStart, minutesOfDay, toMinutes, weekParityOf, weekdayOf } from "@/lib/time";

export type LessonView = {
  id: string;
  date: string;
  slot: number;
  start: string;
  end: string;
  title: string;
  teacher: string;
  room: string;
  kind: string;
  cancelled: boolean;
  change: { kind: string; comment: string | null; text: string } | null;
};

/** Группа текущего студента из сессии. У сотрудника группы нет. */
async function myGroupId(user: CurrentUser): Promise<string | null> {
  const p = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { groupId: true } });
  return p?.groupId ?? null;
}

/** Пары группы текущего студента на одну дату с учётом переносов, замен и отмен. */
export async function getMyLessonsOn(user: CurrentUser, day: string): Promise<LessonView[]> {
  return lessonsForGroup(await myGroupId(user), day);
}

// groupId всегда берётся из профиля пользователя в сессии (myGroupId), снаружи сюда он не попадает.
async function lessonsForGroup(groupId: string | null, day: string): Promise<LessonView[]> {
  if (!groupId) return [];

  const parity = weekParityOf(day);
  const lessons = await prisma.lesson.findMany({
    where: { groupId, weekday: weekdayOf(day), weekParity: { in: ["both", parity] } },
    include: { course: true, changes: { where: { date: dayStart(day) } } },
  });

  const views = lessons.map((l): LessonView => {
    const ch = l.changes[0];
    const slot = ch?.kind === "перенос" && ch.newSlot ? ch.newSlot : l.slot;
    const room = ch?.kind === "замена аудитории" && ch.newRoom ? ch.newRoom : l.room;
    const times = SLOT_TIMES[slot];
    let text = "";
    if (ch?.kind === "отмена") text = "Пара отменена";
    if (ch?.kind === "перенос" && ch.newSlot) text = `Перенесена на ${SLOT_TIMES[ch.newSlot].start}`;
    if (ch?.kind === "замена аудитории" && ch.newRoom) text = `Аудитория ${l.room} → ${ch.newRoom}`;
    return {
      id: l.id,
      date: day,
      slot,
      start: times.start,
      end: times.end,
      title: l.course.title,
      teacher: l.course.teacher,
      room,
      kind: l.kind,
      cancelled: ch?.kind === "отмена",
      change: ch ? { kind: ch.kind, comment: ch.comment, text } : null,
    };
  });
  return views.sort((a, b) => a.slot - b.slot);
}

/** Пары группы текущего студента на неделю (пн-сб), начиная с понедельника monday. */
export async function getMyWeek(user: CurrentUser, monday: string) {
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const groupId = await myGroupId(user); // один запрос на всю неделю
  const lessons = await Promise.all(days.map((d) => lessonsForGroup(groupId, d)));
  return days.map((date, i) => ({ date, lessons: lessons[i] }));
}

/** Изменения в расписании на ближайшие дни после сегодняшнего (переносы, замены, отмены). */
export async function getMyUpcomingChanges(user: CurrentUser, now: Date = new Date(), days = 3) {
  const groupId = await myGroupId(user);
  const today = dateKey(now);
  const result: { date: string; lesson: LessonView }[] = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    for (const lesson of await lessonsForGroup(groupId, date)) {
      if (lesson.change) result.push({ date, lesson });
    }
  }
  return result;
}

/** Следующая пара: сегодня после текущего момента, иначе в ближайшие 7 дней. */
export async function getMyNextLesson(user: CurrentUser, now: Date = new Date()) {
  const today = dateKey(now);
  const minutes = minutesOfDay(now);
  for (let i = 0; i < 8; i++) {
    const day = addDays(today, i);
    const list = (await getMyLessonsOn(user, day)).filter((l) => !l.cancelled);
    const next = list.find((l) => i > 0 || toMinutes(l.start) > minutes);
    if (next) {
      const minutesLeft = i === 0 ? toMinutes(next.start) - minutes : null;
      return { lesson: next, minutesLeft };
    }
  }
  return null;
}
