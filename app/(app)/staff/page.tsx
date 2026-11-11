import { requireStaff } from "@/lib/auth";
import { Card, EmptyText, PageShell } from "@/components/ui";
import { logoutAction } from "@/app/login/actions";

export const metadata = { title: "Кабинет сотрудника — Мой деканат" };

// Заглушка. Список заявок и объявления будут на шаге 16 ноября.
export default async function StaffPage() {
  await requireStaff();
  return (
    <PageShell title="Кабинет сотрудника">
      <Card>
        <EmptyText>Здесь будут заявки студентов и объявления.</EmptyText>
      </Card>
      <form action={logoutAction}>
        <button type="submit" className="h-11 w-full rounded-md border border-line bg-surface font-medium">
          Выйти
        </button>
      </form>
    </PageShell>
  );
}
