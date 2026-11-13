import type { MetadataRoute } from "next";

// Установка на телефон (PWA): название, иконки, цвета. Без офлайн-режима и служебного скрипта: кабинет работает онлайн.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Мой деканат",
    short_name: "Деканат",
    description: "Личный кабинет студента. Концепт для MGIMO AI Challenge. Не официальный сервис вуза.",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
