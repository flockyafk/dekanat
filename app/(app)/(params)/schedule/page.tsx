import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getMyWeek } from "@/lib/data/schedule";
import { Badge, Card, EmptyText, PageShell } from "@/components/ui";
import { LessonCard } from "@/components/lesson-card";
import { SwipeArea } from "@/components/swipe-area";
import {
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  addDays,
  dateKey,
  formatDateRu,
  isValidDateKey,
  mondayOf,
  weekParityOf,
  weekdayOf,
} from "@/lib/time";

export const metadata = { title: "Расписание — Мой деканат" };
export const dynamic = "force-dynamic";

// ВАЖНО: эта страница лежит в группе (params) БЕЗ loading.tsx и без Suspense. В Next.js 15.5 (production) переход
// по ссылке на ту же страницу с другими параметрами адреса (?d=...&v=...) зависал, если ответ отдавался потоком
// (loading.tsx над страницей или Suspense внутри): адрес не менялся, вид не переключался. Без потоковой отдачи
// все переходы работают (проверено в браузере и в e2e). Страница рендерится за миллисекунды, поэтому экран
// загрузки здесь не нужен.

// Адрес вида /schedule?d=2026-11-16&v=week. Неверные значения заменяются на «сегодня» и «день».
const paramsSchema = z.object({
  d: z.string().optional(),
  v: z.enum(["day", "week"]).catch("day"),
});

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  const raw = await searchParams;
  const parsed = paramsSchema.parse({
    d: typeof raw.d === "string" ? raw.d : undefined,
    v: typeof raw.v === "string" ? raw.v : undefined,
  });
  const today = dateKey();
  // В воскресенье по умолчанию показываем понедельник
  const fallback = weekdayOf(today) === 7 ? addDays(today, 1) : today;
  const selected = parsed.d && isValidDateKey(parsed.d) ? parsed.d : fallback;
  const view = parsed.v;

  const monday = mondayOf(selected);
  const week = await getMyWeek(user, monday);
  const parity = weekParityOf(monday);

  const href = (d: string, v = view) => `/schedule?d=${d}&v=${v}`;
  const step = view === "week" ? 7 : weekdayOf(selected) === 6 ? 2 : 1; // из субботы день листается на понедельник
  const prevDay = view === "week" ? addDays(selected, -7) : weekdayOf(selected) === 1 ? addDays(selected, -2) : addDays(selected, -1);
  const nextDay = addDays(selected, step);
  const selectedDay = week.find((d) => d.date === selected);

  return (
    <PageShell title="Расписание">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Вид" className="flex rounded-md border border-line bg-surface p-1">
          {(["day", "week"] as const).map((v) => (
            <Link
              key={v}
              role="tab"
              aria-selected={view === v}
              href={href(selected, v)}
              className={`flex min-h-11 min-w-20 items-center justify-center rounded-sm px-3 text-sm font-medium ${
                view === v ? "bg-brand text-on-accent" : "text-foreground"
              }`}
            >
              {v === "day" ? "День" : "Неделя"}
            </Link>
          ))}
        </div>
        {selected !== fallback && (
          <Link href={href(fallback)} className="flex min-h-11 items-center px-2 text-sm text-brand underline">
            Сегодня
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link href={href(addDays(selected, -7))} aria-label="Предыдущая неделя" className="flex size-11 items-center justify-center rounded-md border border-line bg-surface">
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <p className="text-center">
          <Badge tone={parity === "upper" ? "brand" : "ok"}>{parity === "upper" ? "Верхняя неделя" : "Нижняя неделя"}</Badge>
          <span className="mt-1 block text-sm text-muted">
            {formatDateRu(monday)} — {formatDateRu(addDays(monday, 5))}
          </span>
        </p>
        <Link href={href(addDays(selected, 7))} aria-label="Следующая неделя" className="flex size-11 items-center justify-center rounded-md border border-line bg-surface">
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </div>

      {view === "day" ? (
        <>
          <nav aria-label="Дни недели">
            <ul className="grid grid-cols-6 gap-1">
              {week.map(({ date, lessons }) => {
                const active = date === selected;
                const hasChange = lessons.some((l) => l.change);
                return (
                  <li key={date}>
                    <Link
                      href={href(date)}
                      aria-current={active ? "date" : undefined}
                      className={`flex min-h-14 flex-col items-center justify-center rounded-md border text-sm ${
                        active ? "border-brand bg-brand text-on-accent" : "border-line bg-surface"
                      }`}
                    >
                      <span className="font-medium">{WEEKDAYS_SHORT[weekdayOf(date) % 7]}</span>
                      <span className={active ? "text-on-accent" : "text-muted"}>{Number(date.slice(8))}</span>
                      {hasChange && <span className="sr-only">есть изменения</span>}
                      {hasChange && <span aria-hidden className={`mt-0.5 size-1.5 rounded-lg ${active ? "bg-on-accent" : "bg-warn"}`} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <SwipeArea prevHref={href(prevDay)} nextHref={href(nextDay)}>
            <h2 className="mb-2 font-semibold">
              {WEEKDAYS_FULL[weekdayOf(selected) % 7]}, {formatDateRu(selected)}
            </h2>
            {selectedDay && selectedDay.lessons.length > 0 ? (
              <ul className="space-y-3">
                {selectedDay.lessons.map((l) => (
                  <LessonCard key={l.id} lesson={l} />
                ))}
              </ul>
            ) : (
              <Card>
                <EmptyText>{selected === today ? "Сегодня пар нет" : "В этот день пар нет"}</EmptyText>
              </Card>
            )}
          </SwipeArea>
        </>
      ) : (
        <div className="space-y-5">
          {week.map(({ date, lessons }) => (
            <section key={date} aria-label={WEEKDAYS_FULL[weekdayOf(date) % 7]}>
              <h2 className="mb-2 flex items-baseline justify-between font-semibold">
                <Link href={href(date, "day")} className="flex min-h-11 items-center underline">
                  {WEEKDAYS_FULL[weekdayOf(date) % 7]}, {formatDateRu(date)}
                </Link>
                {date === today && <Badge tone="brand">Сегодня</Badge>}
              </h2>
              {lessons.length > 0 ? (
                <ul className="space-y-3">
                  {lessons.map((l) => (
                    <LessonCard key={l.id} lesson={l} />
                  ))}
                </ul>
              ) : (
                <EmptyText>Пар нет</EmptyText>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="pt-2">
        {/* Обычная ссылка, не Link: это файл, а не страница */}
        <a
          href="/schedule.ics"
          download
          className="flex min-h-11 items-center justify-center rounded-md border border-brand bg-surface px-4 font-medium text-brand"
        >
          Добавить в календарь (.ics)
        </a>
        <span className="mt-1 block text-center text-xs text-muted">Пары на 5 недель вперёд из вашего расписания</span>
      </p>
    </PageShell>
  );
}
