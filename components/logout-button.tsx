"use client";

import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { browserStorage, clearAllHistories } from "@/lib/chat-history";

/**
 * Кнопка выхода. Перед отправкой формы стирает в браузере истории диалога с помощником (sessionStorage),
 * чтобы следующий человек за этим браузером их не увидел. Сам выход (удаление сессии) делает сервер.
 */
export function LogoutButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form action={logoutAction} onSubmit={() => clearAllHistories(browserStorage())}>
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
