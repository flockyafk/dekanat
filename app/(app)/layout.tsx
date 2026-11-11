import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyUnreadCount } from "@/lib/data/notifications";
import { BottomNav, SideNav } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await getMyUnreadCount(user);
  const isStudent = user.role === "student";

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface px-4">
        <Link href="/" className="flex min-h-11 items-center text-lg font-semibold text-brand">
          Мой деканат
        </Link>
        <Link
          href="/notifications"
          aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
          className="relative flex size-11 items-center justify-center rounded-md hover:bg-background"
        >
          <Bell aria-hidden className="size-6" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-lg bg-danger px-1 text-xs font-semibold text-white">
              {unread}
            </span>
          )}
        </Link>
      </header>
      <div className="flex flex-1">
        {isStudent && <SideNav />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {isStudent && <BottomNav />}
    </div>
  );
}
