import { Skeleton } from "@/components/ui";

/*
 * Экраны загрузки (скелетоны) для страниц-списков (loading.tsx в app/(app)/(lists)).
 * Не добавлять loading.tsx и Suspense на страницы с переходами по параметрам адреса (расписание, кабинет сотрудника)
 * и на страницы-карточки по id: см. «Правило раскладки страниц» в docs/state.md.
 */

const HEIGHTS = { sm: "h-16", md: "h-24", lg: "h-36" } as const;

/** Скелетон страницы: заголовок и несколько блоков заданной высоты. */
export function PageSkeleton({ blocks }: { blocks: (keyof typeof HEIGHTS)[] }) {
  return (
    <main
      id="content"
      role="status"
      aria-busy="true"
      aria-label="Загрузка"
      className="mx-auto w-full max-w-xl flex-1 px-4 py-6"
    >
      <Skeleton className="mb-4 h-8 w-40" />
      <div className="space-y-4">
        {blocks.map((b, i) => (
          <Skeleton key={i} className={HEIGHTS[b]} />
        ))}
      </div>
      <span className="sr-only">Загружаем данные…</span>
    </main>
  );
}
