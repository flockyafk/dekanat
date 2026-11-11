"use client";

import { useActionState } from "react";
import { STAFF_STATUSES } from "@/lib/constants";
import { changeStatusAction, publishAnnouncementAction, type StaffFormState } from "./actions";

const initial: StaffFormState = {};

function Message({ state }: { state: StaffFormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">
        {state.ok}
      </p>
    );
  return null;
}

export function StatusForm({ requestId, current }: { requestId: string; current: string }) {
  const [state, action, pending] = useActionState(changeStatusAction, initial);
  const options = STAFF_STATUSES.filter((s) => s !== current);
  const idPrefix = `st-${requestId}`;

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor={`${idPrefix}-s`} className="block text-sm font-medium">
        Новый статус
      </label>
      <select
        id={`${idPrefix}-s`}
        name="status"
        defaultValue={options[0] ?? STAFF_STATUSES[0]}
        className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
      >
        {STAFF_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label htmlFor={`${idPrefix}-c`} className="block text-sm font-medium">
        Комментарий студенту (необязательно)
      </label>
      <input
        id={`${idPrefix}-c`}
        name="comment"
        maxLength={500}
        className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
      />
      <Message state={state} />
      <button type="submit" disabled={pending} className="h-11 w-full rounded-md bg-brand font-medium text-white disabled:opacity-60">
        {pending ? "Сохраняем…" : "Сохранить статус"}
      </button>
    </form>
  );
}

export function AnnouncementForm({ groups }: { groups: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(publishAnnouncementAction, initial);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="an-audience" className="block text-sm font-medium">
          Кому
        </label>
        <select
          id="an-audience"
          name="audience"
          defaultValue="all"
          className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
        >
          <option value="all">Всем студентам</option>
          <option value="group">Одной группе</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="an-group" className="block text-sm font-medium">
          Группа (если «Одной группе»)
        </label>
        <select
          id="an-group"
          name="groupId"
          defaultValue=""
          className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
        >
          <option value="">—</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="an-title" className="block text-sm font-medium">
          Заголовок
        </label>
        <input
          id="an-title"
          name="title"
          maxLength={100}
          className="h-11 w-full rounded-md border border-line bg-surface px-3 text-base"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="an-body" className="block text-sm font-medium">
          Текст
        </label>
        <textarea
          id="an-body"
          name="body"
          rows={4}
          maxLength={1000}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
      </div>
      <Message state={state} />
      <button type="submit" disabled={pending} className="h-11 w-full rounded-md bg-brand font-medium text-white disabled:opacity-60">
        {pending ? "Публикуем…" : "Опубликовать"}
      </button>
    </form>
  );
}
