import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dailyLimit } from "@/lib/ai";
import { getMyAiUsageToday } from "@/lib/data/assistant";
import { AskBox } from "@/components/ask-box";
import { Card, PageShell } from "@/components/ui";
import { dateKey } from "@/lib/time";

export const metadata = { title: "Спроси деканат — Мой деканат" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");
  const remaining = Math.max(0, dailyLimit() - (await getMyAiUsageToday(user, dateKey())));

  return (
    <PageShell title="Спроси деканат">
      <Card>
        <p className="mb-3 text-sm text-muted">
          Помощник отвечает по вашему расписанию, учёбе, заявкам и объявлениям. Если ответа в ваших данных нет, он так и скажет.
          Сейчас работает пробная версия с готовыми ответами.
        </p>
        <AskBox remaining={remaining} />
      </Card>
    </PageShell>
  );
}
