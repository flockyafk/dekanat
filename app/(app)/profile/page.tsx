import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/data/profile";
import { Card, PageShell } from "@/components/ui";
import { logoutAction } from "@/app/login/actions";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Профиль — Мой деканат" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  if (user.role === "staff") redirect("/staff");
  const p = await getMyProfile(user);
  if (!p) {
    return (
      <PageShell title="Профиль">
        <p role="alert" className="rounded-md bg-danger-bg p-3 text-danger">
          Профиль не найден.
        </p>
      </PageShell>
    );
  }

  const rows: [string, string][] = [
    ["ФИО", p.fullName],
    ["Факультет", p.faculty],
    ["Направление", p.direction],
    ["Курс", String(p.course)],
    ["Группа", p.group.name],
    ["Номер зачётки", p.recordBook],
    ["Почта", p.email],
  ];

  return (
    <PageShell title="Профиль">
      <Card>
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="py-2">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Смена пароля" id="pwd">
        <PasswordForm />
      </Card>
      <form action={logoutAction}>
        <button type="submit" className="h-11 w-full rounded-md border border-line bg-surface font-medium">
          Выйти
        </button>
      </form>
    </PageShell>
  );
}
