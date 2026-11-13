import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Мой деканат",
  description: "Личный кабинет студента. Концепт для MGIMO AI Challenge.",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Деканат", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d4ed8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        {children}
        <footer className="border-t border-line px-4 pb-20 pt-4 text-center text-xs text-muted md:pb-4">
          Концепт для MGIMO AI Challenge. Не официальный сервис вуза
        </footer>
      </body>
    </html>
  );
}
