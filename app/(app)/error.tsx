"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <div role="alert" className="rounded-lg bg-danger-bg p-4 text-danger">
        <p className="mb-3 font-semibold">Не получилось загрузить страницу.</p>
        <button onClick={reset} className="h-11 rounded-md bg-brand px-4 font-medium text-white">
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
