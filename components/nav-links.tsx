"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Нижняя панель на телефоне. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Основное меню"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden"
    >
      <ul className="mx-auto flex max-w-xl">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? "font-semibold text-brand" : "text-muted"
                }`}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Боковая панель на компьютере. */
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Основное меню" className="hidden w-56 shrink-0 border-r border-line bg-surface md:block">
      <ul className="sticky top-0 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-base ${
                  active ? "bg-brand-soft font-semibold text-brand" : "text-foreground hover:bg-background"
                }`}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
