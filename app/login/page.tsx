import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход — Мой деканат" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Мой деканат</h1>
      <p className="mb-6 text-sm text-muted">Войдите, чтобы увидеть своё расписание и заявки.</p>
      <LoginForm />
      <Link href="/about" className="mt-4 flex min-h-11 items-center text-brand underline">
        Тестовые аккаунты и о проекте
      </Link>
    </main>
  );
}
