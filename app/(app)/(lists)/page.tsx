import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { roomLabel } from "@/lib/room";
import { getTodayData } from "@/lib/data/today";
import { getMyProfile } from "@/lib/data/profile";
import { Badge, Card, EmptyText, PageShell } from "@/components/ui";
import { dateKey, formatDateTimeRu, formatMinutes, WEEKDAYS_FULL, formatDateRu, weekdayOf } from "@/lib/time";
import { redirect } from "next/navigation";
import { AskBox } from "@/components/ask-box";
import { dailyLimit } from "@/lib/ai";
import { getMyAiUsageToday } from "@/lib/data/assistant";

export const metadata = { title: "Сегодня — Мой деканат" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  const [profile, data, used] = await Promise.all([
    getMyProfile(user),
    getTodayData(user),
    getMyAiUsageToday(user, dateKey()),
  ]);
  const next = data.next;
  const remaining = Math.max(0, dailyLimit() - used);

  return (
    <PageShell title="Сегодня">
      <p className="-mt-2 text-muted">Здравствуйте, {profile?.fullName.split(" ")[1] ?? "студент"}.</p>

      <Card title="Следующая пара" id="next">
        {next ? (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">{next.lesson.title}</p>
              {next.minutesLeft !== null && <Badge tone="brand">через {formatMinutes(next.minutesLeft)}</Badge>}
            </div>
            <p className="text-muted">
              {next.minutesLeft === null
                ? `${WEEKDAYS_FULL[weekdayOf(next.lesson.date) % 7]}, ${formatDateRu(next.lesson.date)}, `
                : ""}
              {next.lesson.start}–{next.lesson.end}, {next.lesson.kind}
            </p>
            <p className="text-muted">
              {roomLabel(next.lesson.room)}, {next.lesson.teacher}
            </p>
            {next.lesson.change && <p className="mt-2"><Badge tone="warn">{next.lesson.change.text}</Badge></p>}
          </div>
        ) : (
          <EmptyText>Ближайших пар нет.</EmptyText>
        )}
      </Card>

      <Card title="Изменения на сегодня" id="changes">
        {data.changes.length === 0 ? (
          <EmptyText>Изменений нет.</EmptyText>
        ) : (
          <ul className="space-y-3">
            {data.changes.map((l) => (
              <li key={l.id} className={`rounded-md p-3 ${l.cancelled ? "bg-danger-bg" : "bg-warn-bg"}`}>
                <p className={`font-semibold ${l.cancelled ? "text-danger" : "text-warn"}`}>{l.change?.text}</p>
                <p>
                  {l.title}, {l.start}–{l.end}
                </p>
                {l.change?.comment && <p className="text-sm text-muted">{l.change.comment}</p>}
              </li>
            ))}
          </ul>
        )}
        {data.upcomingChanges.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-2 text-sm font-medium">В ближайшие дни</h3>
            <ul className="space-y-3">
              {data.upcomingChanges.map(({ date, lesson: l }) => (
                <li key={`${date}-${l.id}`} className={`rounded-md p-3 ${l.cancelled ? "bg-danger-bg" : "bg-warn-bg"}`}>
                  <p className={`font-semibold ${l.cancelled ? "text-danger" : "text-warn"}`}>
                    {WEEKDAYS_FULL[weekdayOf(date) % 7]}, {formatDateRu(date)}: {l.change?.text}
                  </p>
                  <p>
                    {l.title}, {l.start}–{l.end}
                  </p>
                  {l.change?.comment && <p className="text-sm text-muted">{l.change.comment}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/schedule" className="mt-3 inline-flex min-h-11 items-center gap-1 text-brand underline">
          Всё расписание <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Card>

      <Card title="Требует действия" id="todo">
        {data.deadlines.length === 0 && data.requests.length === 0 ? (
          <EmptyText>Срочных дел нет.</EmptyText>
        ) : (
          <ul className="space-y-3">
            {data.deadlines.map((d) => (
              <li key={d.id}>
                <p className="font-medium">{d.title}</p>
                <p className="text-sm text-muted">До {formatDateTimeRu(d.dueAt)}</p>
              </li>
            ))}
            {data.requests.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex min-h-11 flex-col justify-center">
                  <span className="font-medium">{r.type}</span>
                  <span className="text-sm">
                    Статус: <Badge tone={r.status === "Готова" ? "ok" : r.status === "Отклонена" ? "danger" : "brand"}>{r.status}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Как у меня дела" id="summary">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Link href="/grades" className="rounded-md bg-background p-2">
            <dt className="text-xs text-muted">Средний балл</dt>
            <dd className="text-xl font-semibold">{data.summary.average ?? "—"}</dd>
          </Link>
          <Link href="/grades" className="rounded-md bg-background p-2">
            <dt className="text-xs text-muted">Долги</dt>
            <dd className={`text-xl font-semibold ${data.summary.debts ? "text-danger" : ""}`}>{data.summary.debts}</dd>
          </Link>
          <Link href="/grades" className="rounded-md bg-background p-2">
            <dt className="text-xs text-muted">Экзамен</dt>
            <dd className="text-sm font-semibold">
              {data.summary.exam ? formatDateRu(dateKey(data.summary.exam.date)) : "—"}
            </dd>
          </Link>
        </dl>
        {data.summary.exam && <p className="mt-2 text-sm text-muted">Ближайший: {data.summary.exam.title}</p>}
      </Card>

      <Card title="Объявления деканата" id="news">
        {data.announcements.length === 0 ? (
          <EmptyText>Объявлений пока нет.</EmptyText>
        ) : (
          <ul className="space-y-3">
            {data.announcements.map((a) => (
              <li key={a.id}>
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-muted">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Спроси деканат" id="ask">
        <AskBox userId={user.id} compact remaining={remaining} />
      </Card>
    </PageShell>
  );
}
