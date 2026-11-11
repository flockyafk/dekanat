"use client";

import { useActionState, useState } from "react";
import { REQUEST_TYPES } from "@/lib/constants";
import { createRequestAction, type RequestFormState } from "./actions";

export function RequestForm({ initialType }: { initialType: string }) {
  const [state, action, pending] = useActionState(createRequestAction, {} as RequestFormState);
  const [type, setType] = useState(state.type || initialType);
  const hint = REQUEST_TYPES.find((t) => t.value === type)?.hint ?? "";

  return (
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
          rows={6}
          maxLength={1000}
          defaultValue={state.text ?? ""}
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
        className="h-11 w-full rounded-md bg-brand font-medium text-white disabled:opacity-60"
      >
        {pending ? "Отправляем…" : "Отправить заявку"}
      </button>
    </form>
  );
}
