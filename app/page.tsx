import { requireUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/data/profile";
import { logoutAction } from "./login/actions";

// Временная заглушка экрана «Сегодня». Полноценный экран будет на шаге 2.
export default async function HomePage() {
  const user = await requireUser();
  const profile = await getMyProfile(user);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">Сегодня</h1>
      <p className="mb-6 text-muted">
        {profile ? `Здравствуйте, ${profile.fullName}.` : `Вы вошли как ${user.login} (сотрудник деканата).`}
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="h-11 rounded-md border border-line bg-surface px-4 text-base font-medium"
        >
          Выйти
        </button>
      </form>
    </main>
  );
}
