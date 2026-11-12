import {
  Bell,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  House,
  Info,
  LogOut,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; action?: "logout" };

// Пять пунктов студента из раздела 6 ТЗ.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Сегодня", icon: House },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/grades", label: "Учёба", icon: GraduationCap },
  { href: "/requests", label: "Заявки", icon: ClipboardList },
  { href: "/profile", label: "Профиль", icon: UserRound },
];

// Меню сотрудника деканата: заявки и объявления, уведомления, о проекте, выход.
export const STAFF_NAV_ITEMS: NavItem[] = [
  { href: "/staff", label: "Заявки", icon: ClipboardList },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/about", label: "О проекте", icon: Info },
  { href: "/login", label: "Выйти", icon: LogOut, action: "logout" },
];

export function navItemsFor(role: "student" | "staff"): NavItem[] {
  return role === "staff" ? STAFF_NAV_ITEMS : NAV_ITEMS;
}
