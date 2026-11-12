"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItemsFor, type NavItem } from "@/lib/nav";
import { logoutAction } from "@/app/login/actions";

type Role = "student" | "staff";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Пункт меню: ссылка или кнопка выхода (форма с серверным действием). */
function NavEntry({ item, active, variant }: { item: NavItem; active: boolean; variant: "bottom" | "side" }) {
  const Icon = item.icon;
  const cls =
    variant === "bottom"
      ? `flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-semibold text-brand" : "text-muted"}`
      : `flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-base ${
          active ? "bg-brand-soft font-semibold text-brand" : "text-foreground hover:bg-background"
        }`;
  const content = (
    <>
      <Icon aria-hidden className="size-5" />
      {item.label}
    </>
  );

  if (item.action === "logout") {
    return (
      <form action={logoutAction}>
        <button type="submit" className={cls}>
          {content}
        </button>
      </form>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cls}>
      {content}
    </Link>
  );
}

/** Нижняя панель на телефоне. У студента пять пунктов, у сотрудника четыре. */
export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основное меню" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden">
      <ul className="mx-auto flex max-w-xl">
        {navItemsFor(role).map((item) => (
          <li key={item.label} className="flex-1">
            <NavEntry item={item} active={item.action ? false : isActive(pathname, item.href)} variant="bottom" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Боковая панель на компьютере. */
export function SideNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основное меню" className="hidden w-56 shrink-0 border-r border-line bg-surface md:block">
      <ul className="sticky top-0 space-y-1 p-3">
        {navItemsFor(role).map((item) => (
          <li key={item.label}>
            <NavEntry item={item} active={item.action ? false : isActive(pathname, item.href)} variant="side" />
          </li>
        ))}
      </ul>
    </nav>
  );
}
