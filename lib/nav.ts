import { CalendarDays, ClipboardList, GraduationCap, House, UserRound, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Пять пунктов из раздела 6 ТЗ.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Сегодня", icon: House },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/grades", label: "Учёба", icon: GraduationCap },
  { href: "/requests", label: "Заявки", icon: ClipboardList },
  { href: "/profile", label: "Профиль", icon: UserRound },
];
