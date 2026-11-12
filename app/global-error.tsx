"use client";

// Ошибка самого верхнего уровня (например, сломался общий каркас). Заменяет весь документ, поэтому здесь свои
// html и body, подпись о концепте и стили не зависят от общих компонентов.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f8fafc", color: "#0f172a" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
          <div role="alert" style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 16, padding: 16 }}>
            <h1 style={{ fontWeight: 600, fontSize: 18, margin: 0 }}>Что-то пошло не так.</h1>
            <p style={{ margin: "4px 0 12px", fontSize: 14 }}>Попробуйте ещё раз. Если не помогло, зайдите позже.</p>
            <button
              onClick={reset}
              style={{ height: 44, padding: "0 16px", borderRadius: 10, border: 0, background: "#1d4ed8", color: "#fff", fontSize: 16 }}
            >
              Попробовать снова
            </button>
          </div>
        </main>
        <footer style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#475569" }}>
          Концепт для MGIMO AI Challenge. Не официальный сервис вуза
        </footer>
      </body>
    </html>
  );
}
