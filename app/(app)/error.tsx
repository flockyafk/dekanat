"use client";

import Link from "next/link";

// Состояние ошибки: любая страница кабинета, у которой не получилось загрузить данные.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="content" className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <div role="alert" className="rounded-lg bg-danger-bg p-4 text-danger">
        <h1 className="text-lg font-semibold">Не получилось загрузить страницу.</h1>
        <p className="mt-1 text-sm">Проверьте соединение и попробуйте ещё раз. Остальной кабинет работает.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={reset} className="h-11 rounded-md bg-brand px-4 font-medium text-on-accent">
            Попробовать снова
          </button>
          <Link href="/" className="flex h-11 items-center rounded-md border border-line bg-surface px-4 font-medium text-foreground">
            На экран «Сегодня»
          </Link>
        </div>
      </div>
    </main>
  );
}
