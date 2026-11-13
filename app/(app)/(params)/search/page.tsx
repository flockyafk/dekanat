import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { SEARCH_MAX, SEARCH_MIN, searchMine, searchQuerySchema, type SearchHit } from "@/lib/data/search";
import { Card, EmptyText, PageShell } from "@/components/ui";

export const metadata = { title: "Поиск — Мой деканат" };
export const dynamic = "force-dynamic";

// Как и расписание, страница в группе (params) без loading.tsx: поиск идёт по адресу ?q=..., а потоковая отдача
// ломала переходы по ссылкам с параметрами (см. комментарий в schedule/page.tsx). Ответ приходит за миллисекунды.

function Group({ title, hits }: { title: string; hits: SearchHit[] }) {
  if (hits.length === 0) return null;
  return (
    <Card title={title}>
      <ul className="-my-1 divide-y divide-line">
        {hits.map((h) => (
          <li key={h.id}>
            <Link href={h.href} className="block min-h-11 py-2">
              <span className="block font-medium">{h.title}</span>
              <span className="block text-sm text-muted">{h.subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");

  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q.slice(0, 200) : "";
  const valid = searchQuerySchema.safeParse(q).success;
  const result = valid ? await searchMine(user, q) : null;

  return (
    <PageShell title="Поиск">
      <form action="/search" role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Что искать: предмет, преподаватель, заявка
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q.slice(0, SEARCH_MAX)}
          maxLength={SEARCH_MAX}
          placeholder="Предмет, преподаватель, заявка"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-base"
        />
        <button type="submit" className="flex h-11 items-center gap-1 rounded-md bg-brand px-4 font-medium text-on-accent">
          <Search aria-hidden className="size-4" /> Найти
        </button>
      </form>

      {!result && (
        <Card>
          <EmptyText>
            {q.trim().length > 0 && q.trim().length < SEARCH_MIN
              ? `Введите хотя бы ${SEARCH_MIN} буквы.`
              : "Ищем по вашему расписанию, дисциплинам, оценкам, заявкам и объявлениям."}
          </EmptyText>
        </Card>
      )}

      {result && result.total === 0 && (
        <Card>
          <EmptyText>По запросу «{result.query}» ничего не нашлось. Попробуйте другое слово.</EmptyText>
        </Card>
      )}

      {result && result.total > 0 && (
        <>
          <p role="status" className="text-sm text-muted">
            Найдено: {result.total}
          </p>
          <Group title="Дисциплины" hits={result.courses} />
          <Group title="Расписание" hits={result.lessons} />
          <Group title="Оценки" hits={result.grades} />
          <Group title="Заявки" hits={result.requests} />
          <Group title="Объявления" hits={result.announcements} />
        </>
      )}
    </PageShell>
  );
}
