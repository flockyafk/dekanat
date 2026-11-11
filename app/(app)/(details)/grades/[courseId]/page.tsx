import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getMyCourse, RISK_ATTENDANCE } from "@/lib/data/grades";
import { Badge, Card, EmptyText, PageShell } from "@/components/ui";
import { dateKey, formatDateRu } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Дисциплина — Мой деканат" };

const idSchema = z.string().min(1).max(64);

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  const parsed = idSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();

  // Чужая или несуществующая дисциплина: студент на неё не записан, ответ одинаковый — 404
  const course = await getMyCourse(user, parsed.data);
  if (!course) notFound();

  return (
    <PageShell title={course.title}>
      <Link href="/grades" className="-mt-2 inline-flex min-h-11 items-center gap-1 text-brand underline">
        <ArrowLeft aria-hidden className="size-4" /> Вся учёба
      </Link>

      <Card>
        <dl className="divide-y divide-line">
          <div className="py-2">
            <dt className="text-sm text-muted">Преподаватель</dt>
            <dd className="font-medium">{course.teacher}</dd>
          </div>
          <div className="py-2">
            <dt className="text-sm text-muted">Форма контроля</dt>
            <dd className="font-medium">{course.control === "экзамен" ? "Экзамен" : "Зачёт"}</dd>
          </div>
          <div className="py-2">
            <dt className="text-sm text-muted">Текущий балл</dt>
            <dd className={`text-xl font-semibold ${course.average !== null && course.average < 60 ? "text-danger" : ""}`}>
              {course.average ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Оценки по работам" id="grades">
        {course.grades.length === 0 ? (
          <EmptyText>Оценок пока нет.</EmptyText>
        ) : (
          <ul className="divide-y divide-line">
            {course.grades.map((g) => (
              <li key={g.id} className="flex min-h-11 items-center justify-between gap-2 py-2">
                <span>
                  <span className="block font-medium">{g.title}</span>
                  <span className="block text-sm text-muted">{formatDateRu(dateKey(g.date))}</span>
                </span>
                <span className="font-semibold">
                  {g.score} <span className="text-sm font-normal text-muted">из {g.maxScore}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Посещаемость" id="attendance">
        {course.attendance ? (
          <>
            <p className="flex items-center justify-between">
              <span>
                Посещено {course.attendance.attended} из {course.attendance.held}
              </span>
              <Badge tone={(course.attendance.pct ?? 0) < RISK_ATTENDANCE ? "danger" : "ok"}>{course.attendance.pct}%</Badge>
            </p>
            <div
              role="progressbar"
              aria-label="Посещаемость"
              aria-valuenow={course.attendance.pct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-2 overflow-hidden rounded-sm bg-line"
            >
              <div
                className={`h-full ${(course.attendance.pct ?? 0) < RISK_ATTENDANCE ? "bg-danger" : "bg-ok"}`}
                style={{ width: `${course.attendance.pct ?? 0}%` }}
              />
            </div>
          </>
        ) : (
          <EmptyText>Данных о посещаемости нет.</EmptyText>
        )}
      </Card>

      <Card title={course.control === "экзамен" ? "Экзамен" : "Зачёт"} id="exam">
        {course.exams.length === 0 ? (
          <EmptyText>Дата ещё не назначена.</EmptyText>
        ) : (
          <ul className="space-y-2">
            {course.exams.map((e) => (
              <li key={e.id} className="flex min-h-11 items-center justify-between gap-2">
                <span className="font-medium">{formatDateRu(dateKey(e.date))}</span>
                <Badge tone={e.status === "сдано" ? "ok" : e.status === "не сдано" ? "danger" : "brand"}>
                  {e.status === "назначено" ? "назначен" : e.result ?? e.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
