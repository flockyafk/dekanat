import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мой деканат",
  description: "Личный кабинет студента. Концепт для MGIMO AI Challenge.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="flex min-h-dvh flex-col antialiased">
        {children}
        <footer className="border-t border-line px-4 pb-20 pt-4 text-center text-xs text-muted md:pb-4">
          Концепт для MGIMO AI Challenge. Не официальный сервис вуза
        </footer>
      </body>
    </html>
  );
}
