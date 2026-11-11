"use client";

import { useActionState } from "react";
import { changePasswordAction, type PasswordState } from "./actions";

const initial: PasswordState = {};

const fields = [
  { name: "current", label: "Текущий пароль", autoComplete: "current-password" },
  { name: "next", label: "Новый пароль (от 8 символов)", autoComplete: "new-password" },
  { name: "repeat", label: "Повторите новый пароль", autoComplete: "new-password" },
];

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="space-y-3">
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <label htmlFor={f.name} className="block text-sm font-medium">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type="password"
            autoComplete={f.autoComplete}
            required
            className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
          />
        </div>
      ))}
      {state.error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">
          Пароль изменён.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-md bg-brand font-medium text-white disabled:opacity-60"
      >
        {pending ? "Сохраняем…" : "Сменить пароль"}
      </button>
    </form>
  );
}
