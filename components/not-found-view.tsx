import Link from "next/link";

/** Страница 404 на русском. Одинакова для чужой и несуществующей записи, чтобы не выдавать, что запись существует. */
export function NotFoundView() {
  return (
    <main id="content" className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-semibold text-brand">404</p>
      <h1 className="text-xl font-semibold">Такой страницы нет</h1>
      <p className="text-muted">Ссылка устарела или этой записи у вас нет.</p>
      <Link href="/" className="flex h-11 items-center rounded-md bg-brand px-4 font-medium text-white">
        На экран «Сегодня»
      </Link>
    </main>
  );
}
