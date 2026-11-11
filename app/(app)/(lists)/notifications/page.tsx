import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMyNotifications } from "@/lib/data/notifications";
import { isKnownRoute } from "@/lib/routes";
import { Badge, Card, EmptyText, PageShell } from "@/components/ui";
import { formatDateTimeRu } from "@/lib/time";
import { markAllReadAction, markReadAction } from "./actions";

export const metadata = { title: "Уведомления — Мой деканат" };
export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "brand" | "warn" | "ok" | "danger"> = {
  объявление: "brand",
  расписание: "warn",
  дедлайн: "danger",
  заявка: "ok",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await getMyNotifications(user);
  const unread = items.filter((n) => !n.read).length;

  return (
    <PageShell title="Уведомления">
      {unread > 0 && (
        <form action={markAllReadAction}>
          <button type="submit" className="h-11 w-full rounded-md border border-line bg-surface font-medium">
            Отметить всё прочитанным ({unread})
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyText>Уведомлений пока нет.</EmptyText>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border p-3 ${n.read ? "border-line bg-surface" : "border-brand bg-brand-soft"}`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone={KIND_TONE[n.kind] ?? "brand"}>{n.kind}</Badge>
                {!n.read && <span className="text-xs font-semibold text-brand">Новое</span>}
                <span className="text-sm text-muted">{formatDateTimeRu(n.createdAt)}</span>
              </div>
              <p className="font-semibold">{n.title}</p>
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {isKnownRoute(n.link) && (
                  <Link href={n.link} className="flex min-h-11 items-center text-brand underline">
                    Открыть
                  </Link>
                )}
                {!n.read && (
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="min-h-11 px-2 text-sm underline">
                      Прочитано
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
