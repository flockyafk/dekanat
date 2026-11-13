import { Badge } from "@/components/ui";
import { roomLabel } from "@/lib/room";
import type { LessonView } from "@/lib/data/schedule";

/** Карточка пары: время, предмет, тип, аудитория, преподаватель, изменения. */
export function LessonCard({ lesson }: { lesson: LessonView }) {
  const ch = lesson.change;
  const tone = lesson.cancelled ? "bg-danger-bg" : ch ? "bg-warn-bg" : "bg-surface";

  return (
    <li className={`rounded-lg border border-line p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold ${lesson.cancelled ? "line-through" : ""}`}>{lesson.title}</p>
          <p className="text-sm text-muted">
            {lesson.kind}, {lesson.teacher}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">{lesson.start}</p>
          <p className="text-sm text-muted">{lesson.end}</p>
        </div>
      </div>
      <p className="mt-1 text-sm">{roomLabel(lesson.room)}</p>
      {ch && (
        <p className="mt-2">
          <Badge tone={lesson.cancelled ? "danger" : "warn"}>{ch.text}</Badge>
          {ch.comment && <span className="ml-2 text-sm text-muted">{ch.comment}</span>}
        </p>
      )}
    </li>
  );
}
