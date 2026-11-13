import { getCurrentUser } from "@/lib/auth";
import { getMyIcs } from "@/lib/data/calendar";

export const dynamic = "force-dynamic";

// Файл календаря текущего студента. Без входа 401, у сотрудника расписания нет (404). Данные только из сессии.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Войдите в кабинет", { status: 401 });
  const ics = await getMyIcs(user);
  if (ics === null) return new Response("Не найдено", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dekanat-schedule.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
