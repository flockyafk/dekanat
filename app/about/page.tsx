export const metadata = { title: "О проекте — Мой деканат" };

const accounts = [
  { who: "Студент 1 (группа 1)", login: "student1", password: "demo-student-1" },
  { who: "Студент 2 (группа 1)", login: "student2", password: "demo-student-2" },
  { who: "Студент 3 (группа 2)", login: "student3", password: "demo-student-3" },
  { who: "Сотрудник деканата", login: "staff", password: "demo-staff-1" },
];

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">О проекте</h1>
      <p className="mb-4 text-muted">
        «Мой деканат» — концепт личного кабинета студента для MGIMO AI Challenge. Все данные вымышленные.
        К настоящим системам вуза проект не подключён.
      </p>
      <h2 className="mb-2 text-lg font-semibold">Тестовые аккаунты</h2>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.login} className="rounded-md border border-line bg-surface p-3 text-sm">
            <div className="font-medium">{a.who}</div>
            <div className="text-muted">
              логин <b>{a.login}</b>, пароль <b>{a.password}</b>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
