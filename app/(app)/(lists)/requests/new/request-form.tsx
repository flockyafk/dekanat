"use client";

import { useActionState, useState, useTransition } from "react";
import { REQUEST_TYPES } from "@/lib/constants";
import { createRequestAction, draftRequestAction, type RequestFormState } from "./actions";

export function RequestForm({ initialType }: { initialType: string }) {
  const [state, action, pending] = useActionState(createRequestAction, {} as RequestFormState);
  const [type, setType] = useState(state.type || initialType);
  const [text, setText] = useState(state.text ?? "");
  const [situation, setSituation] = useState("");
  const [draftMsg, setDraftMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drafting, startDraft] = useTransition();
  const hint = REQUEST_TYPES.find((t) => t.value === type)?.hint ?? "";

  function makeDraft() {
    if (drafting) return;
    setDraftMsg(null);
    startDraft(async () => {
      try {
        const res = await draftRequestAction(situation, type);
        if (res.ok) {
          // Черновик только подставляется в форму. Отправляет заявку студент сам кнопкой ниже.
          setType(res.type);
          setText(res.text);
          setDraftMsg({ ok: true, text: "Черновик готов. Проверьте текст, исправьте и отправьте заявку сами." });
        } else {
          setDraftMsg({ ok: false, text: res.text });
        }
      } catch {
        setDraftMsg({ ok: false, text: "Не получилось составить черновик. Напишите заявку сами, остальное работает." });
      }
    });
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="draft-title" className="space-y-2 rounded-lg bg-brand-soft p-3">
        <h2 id="draft-title" className="font-semibold">
          Помощник составит черновик
        </h2>
        <label htmlFor="situation" className="block text-sm">
          Опишите ситуацию двумя фразами
        </label>
        <textarea
          id="situation"
          rows={3}
          maxLength={300}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="Например: нужна справка в банк для оформления карты. Срок до пятницы."
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
        <button
          type="button"
          onClick={makeDraft}
          disabled={drafting}
          className="h-11 w-full rounded-md border border-brand bg-surface font-medium text-brand disabled:opacity-60"
        >
          {drafting ? "Составляем…" : "Составить черновик"}
        </button>
        {draftMsg && (
          <p
            role={draftMsg.ok ? "status" : "alert"}
            className={`rounded-md px-3 py-2 text-sm ${draftMsg.ok ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}
          >
            {draftMsg.text}
          </p>
        )}
      </section>

      <form action={action} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="type" className="block text-sm font-medium">
            Вид заявки
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
          >
            {REQUEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="text" className="block text-sm font-medium">
            Что нужно
          </label>
          <textarea
            id="text"
            name="text"
            rows={8}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby="text-hint"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base"
          />
          <p id="text-hint" className="text-sm text-muted">
            {hint}
          </p>
        </div>
        {state.error && (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-md bg-brand font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? "Отправляем…" : "Отправить заявку"}
        </button>
      </form>
    </div>
  );
}
