"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { askAction, type AskResult } from "@/app/(app)/(lists)/assistant/actions";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  links?: { href: string; label: string }[];
  error?: boolean;
};

const EXAMPLES = ["Что у меня завтра?", "Какие у меня долги?", "Когда ближайший дедлайн?", "В каком статусе моя справка?"];

/**
 * Поле «Спроси деканат». Вопрос уходит серверным действием (POST), в адрес страницы не попадает.
 * compact: на экране «Сегодня» показывается только последний ответ и ссылка на полный диалог.
 * Ответ показывается как обычный текст, ссылки уже проверены на сервере.
 */
export function AskBox({ compact = false, remaining: initialRemaining }: { compact?: boolean; remaining?: number }) {
  const inputId = useId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [remaining, setRemaining] = useState<number | undefined>(initialRemaining);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");

  function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setValue("");
    setMessages((m) => [...m, { id: m.length * 2, role: "user", text: q }]);
    startTransition(async () => {
      let res: AskResult;
      try {
        res = await askAction(q);
      } catch {
        setMessages((m) => [
          ...m,
          { id: m.length * 2 + 1, role: "assistant", error: true, text: "Не получилось связаться с помощником. Остальной кабинет работает, попробуйте позже." },
        ]);
        return;
      }
      setRemaining(res.remaining);
      setMessages((m) => [
        ...m,
        {
          id: m.length * 2 + 1,
          role: "assistant",
          text: res.answer.text,
          links: res.answer.ok ? res.answer.links : undefined,
          error: !res.answer.ok,
        },
      ]);
    });
  }

  const shown = compact ? messages.slice(-2) : messages;

  return (
    <div>
      {shown.length > 0 && (
        <ul className="mb-3 space-y-2" aria-live="polite">
          {shown.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg p-3 ${
                m.role === "user" ? "ml-6 bg-brand-soft" : m.error ? "mr-6 bg-warn-bg" : "mr-6 border border-line bg-surface"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.links && m.links.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-4">
                  {m.links.map((l) => (
                    <Link key={l.href} href={l.href} className="flex min-h-11 items-center text-brand underline">
                      {l.label}
                    </Link>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <p role="status" className="mb-3 text-sm text-muted">
          Помощник думает…
        </p>
      )}

      {/* method="post": даже без скриптов вопрос не окажется в адресе */}
      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          send(value);
        }}
        className="flex gap-2"
      >
        <label htmlFor={inputId} className="sr-only">
          Ваш вопрос
        </label>
        <input
          id={inputId}
          name="question"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={500}
          autoComplete="off"
          placeholder="Например: что у меня завтра?"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-base"
        />
        <button type="submit" disabled={pending} className="h-11 rounded-md bg-brand px-4 font-medium text-white disabled:opacity-60">
          Спросить
        </button>
      </form>

      <ul className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <button
              type="button"
              disabled={pending}
              onClick={() => send(e)}
              className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm disabled:opacity-60"
            >
              {e}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        {remaining !== undefined && <span>Осталось вопросов сегодня: {remaining}</span>}
        {compact && (
          <Link href="/assistant" className="flex min-h-11 items-center text-brand underline">
            Полный диалог
          </Link>
        )}
      </p>
    </div>
  );
}
