"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { STAFF_STATUSES } from "@/lib/constants";
import { changeRequestStatus, publishAnnouncement } from "@/lib/data/staff";

export type StaffFormState = { error?: string; ok?: string };

const statusSchema = z.object({
  requestId: z.string().min(1).max(64),
  status: z.enum(STAFF_STATUSES, { message: "Выберите статус" }),
  comment: z.string().trim().max(500, "Комментарий не длиннее 500 символов").optional(),
});

export async function changeStatusAction(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const user = await requireStaff(); // студент получает 404 ещё до выполнения
  const parsed = statusSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await changeRequestStatus(user, parsed.data.requestId, parsed.data.status, parsed.data.comment);
  if (!result.ok) return { error: result.error };
  revalidatePath("/staff");
  return { ok: "Статус обновлён, студент получит уведомление." };
}

const announcementSchema = z.object({
  audience: z.enum(["all", "group"], { message: "Выберите, кому показать" }),
  groupId: z.string().max(64).optional(),
  title: z.string().trim().min(3, "Заголовок: от 3 символов").max(100, "Заголовок: до 100 символов"),
  body: z.string().trim().min(3, "Текст: от 3 символов").max(1000, "Текст: до 1000 символов"),
});

export async function publishAnnouncementAction(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const user = await requireStaff();
  const parsed = announcementSchema.safeParse({
    audience: formData.get("audience"),
    groupId: formData.get("groupId") || undefined,
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await publishAnnouncement(user, parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/staff");
  return { ok: "Объявление опубликовано." };
}
