import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Служебный адрес ТОЛЬКО для проверки состояния ошибки в e2e (e2e/mobile.spec.ts). Не раздел кабинета.
// Без переменной E2E_FORCE_ERROR_ROUTE=1 (её задаёт только e2e/serve.mjs) отвечает обычным 404,
// на боевом сайте переменной нет.
export const dynamic = "force-dynamic";

export default async function E2eErrorPage() {
  if (process.env.E2E_FORCE_ERROR_ROUTE !== "1") notFound();
  await requireUser();
  throw new Error("Проверка состояния ошибки (e2e)");
}
