"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

/** Свайп влево и вправо переключает день. Вкладки и стрелки работают и без свайпа. */
export function SwipeArea({
  prevHref,
  nextHref,
  children,
}: {
  prevHref: string;
  nextHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        // горизонтальное движение заметно длиннее вертикального, иначе это прокрутка
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          router.push(dx < 0 ? nextHref : prevHref);
        }
      }}
    >
      {children}
    </div>
  );
}
