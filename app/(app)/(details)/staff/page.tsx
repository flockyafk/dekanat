import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { STAFF_FILTER_STATUSES } from "@/lib/constants";
import { listGroupsForStaff, listRequestsForStaff } from "@/lib/data/staff";
import { Card, EmptyText, PageShell } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTimeRu } from "@/lib/time";
import { AnnouncementForm, StatusForm } from "./staff-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Кабинет сотрудника — Мой деканат" };

// Страница лежит в группе (details) без экрана загрузки: студент получает настоящий код 404.
export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStaff();
  const raw = (await searchParams).status;
  const status = typeof raw === "string" && (STAFF_FILTER_STATUSES as readonly string[]).includes(raw) ? raw : undefined;

  const [requests, groups] = await Promise.all([listRequestsForStaff(user, status), listGroupsForStaff(user)]);

  return (
    <PageShell title="Кабинет сотрудника">
      <Card title="Заявки студентов" id="requests">
        <nav aria-label="Фильтр по статусу" className="mb-3 flex flex-wrap gap-2">
          {[undefined, ...STAFF_FILTER_STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={s ? `/staff?status=${encodeURIComponent(s)}` : "/staff"}
              aria-current={status === s ? "true" : undefined}
              className={`flex min-h-11 items-center rounded-lg border px-3 text-sm ${
                status === s ? "border-brand bg-brand text-on-accent" : "border-line bg-surface"
              }`}
            >
              {s ?? "Все"}
            </Link>
          ))}
        </nav>

        {requests.length === 0 ? (
          <EmptyText>{status ? "Заявок с таким статусом нет." : "Заявок пока нет. Когда студенты подадут заявки, они появятся здесь."}</EmptyText>
        ) : (
          <ul className="space-y-4">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.type}</p>
                    <p className="text-sm text-muted">
                      {r.studentName}, {r.groupName}
                    </p>
                    <p className="text-sm text-muted">{formatDateTimeRu(r.createdAt)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-2 whitespace-pre-wrap">{r.text}</p>
                {r.lastComment && <p className="mt-1 text-sm text-muted">Последний комментарий: {r.lastComment}</p>}
                <StatusForm requestId={r.id} current={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Объявление свёрнуто: главное дело сотрудника это заявки, форма не должна занимать первый экран */}
      <details id="announce" className="rounded-lg border border-line bg-surface p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold uppercase tracking-wide text-muted">
          Новое объявление
        </summary>
        <div className="mt-3">
          <AnnouncementForm groups={groups} />
        </div>
      </details>
    </PageShell>
  );
}
