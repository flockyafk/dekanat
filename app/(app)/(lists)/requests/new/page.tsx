import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { REQUEST_TYPES } from "@/lib/constants";
import { Card, PageShell } from "@/components/ui";
import { RequestForm } from "./request-form";

export const metadata = { title: "Новая заявка — Мой деканат" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  // Вид заявки можно выбрать из каталога по ссылке; неизвестное значение заменяется первым видом
  const raw = (await searchParams).type;
  const wanted = typeof raw === "string" ? raw : "";
  const initialType = REQUEST_TYPES.some((t) => t.value === wanted) ? wanted : REQUEST_TYPES[0].value;

  return (
    <PageShell title="Новая заявка">
      <Link href="/requests" className="-mt-2 inline-flex min-h-11 items-center gap-1 text-brand underline">
        <ArrowLeft aria-hidden className="size-4" /> Все заявки
      </Link>
      <Card>
        <RequestForm initialType={initialType} />
      </Card>
    </PageShell>
  );
}
