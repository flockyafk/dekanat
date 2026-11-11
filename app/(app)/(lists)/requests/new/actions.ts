"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { REQUEST_TYPE_VALUES } from "@/lib/constants";
import { createMyRequest } from "@/lib/data/requests";

const schema = z.object({
  type: z.enum(REQUEST_TYPE_VALUES, { message: "Выберите вид заявки" }),
  text: z.string().trim().min(10, "Опишите подробнее: не меньше 10 символов").max(1000, "Не больше 1000 символов"),
});

export type RequestFormState = { error?: string; type?: string; text?: string };

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
