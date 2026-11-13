"use client";

import { Moon, Sun } from "lucide-react";

const KEY = "dekanat:theme";

/** Переключатель светлой и тёмной темы. Выбор помнится в браузере; если хранилище закрыто, работает без памяти. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* хранилище недоступно: тема сменится, но после перезагрузки вернётся системная */
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Сменить тему: светлая или тёмная"
      className={`flex size-11 items-center justify-center rounded-md hover:bg-background ${className}`}
    >
      <Moon aria-hidden className="theme-to-dark size-6" />
      <Sun aria-hidden className="theme-to-light size-6" />
    </button>
  );
}

/** Скрипт для <head>: ставит тему до первой отрисовки, чтобы не было белой вспышки. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem("${KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();`;
