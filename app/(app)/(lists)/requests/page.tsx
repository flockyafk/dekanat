import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { REQUEST_TYPES } from "@/lib/constants";
import { listMyRequests } from "@/lib/data/requests";
import { Card, EmptyText, PageShell } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { dateKey, formatDateRu } from "@/lib/time";

export const metadata = { title: "Заявки — Мой деканат" };
export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");
  const requests = await listMyRequests(user);

  return (
    <PageShell title="Заявки">
      <Card title="Заказать" id="catalog">
        <ul className="divide-y divide-line">
          {REQUEST_TYPES.map((t) => (
            <li key={t.value}>
              <Link
                href={`/requests/new?type=${encodeURIComponent(t.value)}`}
                className="flex min-h-11 items-center justify-between gap-2 py-2"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Plus aria-hidden className="size-4 text-brand" />
                  {t.value}
                </span>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Мои заявки" id="mine">
        {requests.length === 0 ? (
          <EmptyText>Заявок пока нет. Выберите нужную выше.</EmptyText>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{r.type}</span>
                    <span className="block text-sm text-muted">от {formatDateRu(dateKey(r.createdAt))}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={r.status} />
                    <ChevronRight aria-hidden className="size-5 text-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
