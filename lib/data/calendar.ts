import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { getMyWeek } from "@/lib/data/schedule";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { roomLabel } from "@/lib/room";
import { addDays, dateKey, mondayOf } from "@/lib/time";

/** Число недель в файле: текущая и следующие (расписание по датам, с переносами, заменами и отменами). */
export const ICS_WEEKS = 5;

/**
 * Файл календаря для ТЕКУЩЕГО студента: пары его группы из сессии на ближайшие недели.
 * Отменённые пары в файл не попадают. Для сотрудника (нет группы) возвращает null.
 */
export async function getMyIcs(user: CurrentUser, now: Date = new Date()): Promise<string | null> {
  if (user.role !== "student") return null;
  const first = mondayOf(dateKey(now));
  const events: IcsEvent[] = [];
  for (let w = 0; w < ICS_WEEKS; w++) {
    const week = await getMyWeek(user, addDays(first, w * 7));
    for (const day of week) {
      for (const l of day.lessons) {
        if (l.cancelled) continue;
        events.push({
          uid: `${l.id}-${l.date}-${user.id}@dekanat.concept`,
          date: l.date,
          start: l.start,
          end: l.end,
          title: l.title,
          location: roomLabel(l.room),
          description: [l.kind, l.teacher, l.change?.text].filter(Boolean).join(". "),
        });
      }
    }
  }
  return buildIcs(events, now);
}
