import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyUnreadCount } from "@/lib/data/notifications";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav, SideNav } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await getMyUnreadCount(user);

  return (
    <div className="flex flex-1 flex-col">
      {/* Пропуск к содержимому для клавиатуры: виден только при фокусе */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-brand"
      >
        К содержимому
      </a>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface px-4">
        <Link href={user.role === "staff" ? "/staff" : "/"} className="flex min-h-11 items-center text-lg">
          <Logo />
        </Link>
        <div className="flex items-center">
        <ThemeToggle />
        <Link
          href="/notifications"
          aria-label={unread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"}
          className="relative flex size-11 items-center justify-center rounded-md hover:bg-background"
        >
          <Bell aria-hidden className="size-6" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-lg bg-danger px-1 text-xs font-semibold text-on-accent">
              {unread}
            </span>
          )}
        </Link>
        </div>
      </header>
      <div className="flex flex-1">
        <SideNav role={user.role} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <BottomNav role={user.role} />
    </div>
  );
}
