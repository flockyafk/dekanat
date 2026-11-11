"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/data/notifications";

const idSchema = z.string().min(1).max(64);

export async function markReadAction(formData: FormData) {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await markNotificationRead(user, id.data); // чужое уведомление просто не отмечается
  revalidatePath("/", "layout");
}

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllNotificationsRead(user);
  revalidatePath("/", "layout");
}
