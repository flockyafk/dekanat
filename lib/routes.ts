// Фиксированный список маршрутов кабинета. По нему проверяются все ссылки,
// которые приходят из данных (уведомления) и позже из ответов помощника.
const STATIC_ROUTES = [
  "/",
  "/schedule",
  "/grades",
  "/requests",
  "/requests/new",
  "/notifications",
  "/assistant",
  "/profile",
  "/search",
  "/about",
];

// Маршруты с идентификатором: /grades/<id>, /requests/<id>
const DYNAMIC_ROUTES = [/^\/grades\/[A-Za-z0-9_-]{1,64}$/, /^\/requests\/[A-Za-z0-9_-]{1,64}$/];

/** Ссылка допустима, только если это маршрут кабинета. Любые внешние адреса и javascript: отклоняются. */
export function isKnownRoute(link: string | null | undefined): link is string {
  if (!link || link.length > 200) return false;
  const path = link.split("?")[0];
  return STATIC_ROUTES.includes(path) || DYNAMIC_ROUTES.some((re) => re.test(path));
}
