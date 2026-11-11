import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyCourses, getMySession, getMyStanding } from "@/lib/data/grades";
import { Badge, Card, EmptyText, PageShell } from "@/components/ui";
import { dateKey, formatDateRu } from "@/lib/time";

export const metadata = { title: "Учёба — Мой деканат" };
export const dynamic = "force-dynamic";

export default async function GradesPage() {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  const [courses, session, standing] = await Promise.all([getMyCourses(user), getMySession(user), getMyStanding(user)]);

  return (
    <PageShell title="Учёба">
      <Card title="Как у меня дела" id="standing">
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-background p-2">
            <dt className="text-xs text-muted">Средний балл</dt>
            <dd className="text-xl font-semibold">{standing.average ?? "—"}</dd>
          </div>
          <div className="rounded-md bg-background p-2">
            <dt className="text-xs text-muted">Долги</dt>
            <dd className={`text-xl font-semibold ${standing.debts ? "text-danger" : ""}`}>{standing.debts}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <h3 className="text-sm font-medium">Зона риска</h3>
          {standing.atRisk.length === 0 ? (
            <EmptyText>Всё в порядке: дисциплин в зоне риска нет.</EmptyText>
          ) : (
            <ul className="mt-1 space-y-1">
              {standing.atRisk.map((c) => (
                <li key={c.id}>
                  <Link href={`/grades/${c.id}`} className="flex min-h-11 items-center justify-between gap-2">
                    <span className="font-medium">{c.title}</span>
                    <Badge tone="danger">{c.reasons.join(", ")}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Дисциплины семестра" id="courses">
        {courses.length === 0 ? (
          <EmptyText>В этом семестре дисциплин нет.</EmptyText>
        ) : (
          <ul className="divide-y divide-line">
            {courses.map((c) => (
              <li key={c.id}>
                <Link href={`/grades/${c.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{c.title}</span>
                    <span className="block text-sm text-muted">
                      {c.control === "экзамен" ? "Экзамен" : "Зачёт"}, {c.teacher}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-right">
                      <span className={`block text-lg font-semibold ${c.average !== null && c.average < 60 ? "text-danger" : ""}`}>
                        {c.average ?? "—"}
                      </span>
                      {c.atRisk && <Badge tone="danger">риск</Badge>}
                    </span>
                    <ChevronRight aria-hidden className="size-5 text-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Сессия" id="session">
        <h3 className="text-sm font-medium">Впереди</h3>
        {session.upcoming.length === 0 ? (
          <EmptyText>Назначенных зачётов и экзаменов нет.</EmptyText>
        ) : (
          <ul className="mb-3 mt-1 space-y-2">
            {session.upcoming.map((e) => (
              <li key={e.id}>
                <Link href={`/grades/${e.courseId}`} className="flex min-h-11 items-center justify-between gap-2">
                  <span>
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-sm text-muted">{e.control === "экзамен" ? "Экзамен" : "Зачёт"}</span>
                  </span>
                  <span className="shrink-0 font-medium">{formatDateRu(dateKey(e.date))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-sm font-medium">Результаты</h3>
        {session.results.length === 0 ? (
          <EmptyText>Результатов пока нет.</EmptyText>
        ) : (
          <ul className="mt-1 space-y-2">
            {session.results.map((e) => (
              <li key={e.id} className="flex min-h-11 items-center justify-between gap-2">
                <span>
                  <span className="block font-medium">{e.title}</span>
                  <span className="block text-sm text-muted">{formatDateRu(dateKey(e.date))}</span>
                </span>
                <Badge tone={e.status === "сдано" ? "ok" : "danger"}>
                  {e.status === "сдано" ? e.result ?? "сдано" : `долг: ${e.result ?? "не сдано"}`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
