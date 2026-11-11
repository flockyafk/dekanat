"use server";

import { z } from "zod";
import { getCurrentSessionId, requireUser } from "@/lib/auth";
import { changeMyPassword } from "@/lib/data/profile";

const schema = z
  .object({
    current: z.string().min(1, "Введите текущий пароль").max(200),
    next: z.string().min(8, "Новый пароль: не меньше 8 символов").max(200),
    repeat: z.string().max(200),
  })
  .refine((v) => v.next === v.repeat, { message: "Пароли не совпадают", path: ["repeat"] })
  .refine((v) => v.next !== v.current, { message: "Новый пароль должен отличаться от текущего", path: ["next"] });

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    repeat: formData.get("repeat"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await changeMyPassword(user, parsed.data.current, parsed.data.next, await getCurrentSessionId());
  return result.ok ? { ok: true } : { error: result.error };
}
