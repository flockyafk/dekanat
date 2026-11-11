"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { REQUEST_TYPE_VALUES } from "@/lib/constants";
import { createMyRequest } from "@/lib/data/requests";
import { SITUATION_MAX, SITUATION_MIN, draftRequest } from "@/lib/ai";

const schema = z.object({
  type: z.enum(REQUEST_TYPE_VALUES, { message: "Выберите вид заявки" }),
  text: z.string().trim().min(10, "Опишите подробнее: не меньше 10 символов").max(1000, "Не больше 1000 символов"),
});

export type RequestFormState = { error?: string; type?: string; text?: string };

export type DraftActionResult = { ok: true; type: string; text: string } | { ok: false; text: string };

/**
 * Черновик заявки по описанию ситуации. Заявка НЕ создаётся: текст возвращается в форму,
 * студент правит его и отправляет сам. Вызов идёт как серверное действие (POST), текст не попадает в адрес.
 */
export async function draftRequestAction(situation: string, selectedType: string): Promise<DraftActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      situation: z.string().trim().min(SITUATION_MIN).max(SITUATION_MAX),
      type: z.enum(REQUEST_TYPE_VALUES),
    })
    .safeParse({ situation, type: selectedType });
  if (!parsed.success) {
    return { ok: false, text: `Опишите ситуацию двумя фразами: от ${SITUATION_MIN} до ${SITUATION_MAX} символов.` };
  }
  const result = await draftRequest(user, parsed.data.situation, parsed.data.type);
  return result.ok ? { ok: true, type: result.type, text: result.text } : { ok: false, text: result.text };
}

export async function createRequestAction(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const user = await requireUser();
  const raw = { type: String(formData.get("type") ?? ""), text: String(formData.get("text") ?? "") };
  const parsed = schema.safeParse(raw);
  // При ошибке возвращаем введённое, чтобы студент не печатал заново
  if (!parsed.success) return { error: parsed.error.issues[0].message, ...raw };

  const result = await createMyRequest(user, parsed.data.type, parsed.data.text);
  if (!result.ok) return { error: result.error, ...raw };
  redirect(`/requests/${result.id}`);
}
