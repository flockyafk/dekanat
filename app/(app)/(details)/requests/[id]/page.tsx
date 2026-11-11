import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getMyRequest } from "@/lib/data/requests";
import { Card, PageShell } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTimeRu } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Заявка — Мой деканат" };

const idSchema = z.string().min(1).max(64);

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();

  // Чужая и несуществующая заявка неразличимы: в обоих случаях 404
  const request = await getMyRequest(user, parsed.data);
  if (!request) notFound();

  const lastComment = [...request.events].reverse().find((e) => e.comment && !e.byMe);

  return (
    <PageShell title={request.type}>
      <Link href="/requests" className="-mt-2 inline-flex min-h-11 items-center gap-1 text-brand underline">
        <ArrowLeft aria-hidden className="size-4" /> Все заявки
      </Link>

      <Card>
        <p className="mb-2">
          Статус: <StatusBadge status={request.status} />
        </p>
        <p className="whitespace-pre-wrap">{request.text}</p>
      </Card>

      {lastComment && (
        <Card title="Комментарий деканата" id="comment">
          <p className="whitespace-pre-wrap">{lastComment.comment}</p>
        </Card>
      )}

      <Card title="История" id="history">
        <ol className="space-y-3">
          {request.events.map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-3">
              <p className="flex flex-wrap items-center gap-2">
                <StatusBadge status={e.status} />
                <span className="text-sm text-muted">{e.byMe ? "Вы" : "Деканат"}</span>
              </p>
              <p className="text-sm text-muted">{formatDateTimeRu(e.createdAt)}</p>
              {e.comment && <p className="mt-1 whitespace-pre-wrap">{e.comment}</p>}
            </li>
          ))}
        </ol>
      </Card>
    </PageShell>
  );
}
