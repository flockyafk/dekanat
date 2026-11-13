// Логотип проекта: свой знак (не логотип вуза). Скруглённый квадрат цвета бренда, внутри арка-дверь
// и галочка «решено». Цвета берутся из темы, поэтому знак работает в светлой и тёмной теме.
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="var(--color-brand)" />
      <path d="M8 25V14a8 8 0 0 1 16 0v11" fill="none" stroke="var(--color-on-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12.5 17.5l2.5 2.5 4.5-5" fill="none" stroke="var(--color-on-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Знак и название вместе (шапка, вход, «О проекте»). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-brand ${className}`}>
      <LogoMark />
      <span>Мой деканат</span>
    </span>
  );
}
