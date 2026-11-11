# Мой деканат

Личный кабинет студента. Концепт для MGIMO AI Challenge. Не официальный сервис вуза. Все данные вымышленные.

## Запуск на своём компьютере (PowerShell)

```powershell
npm install
Copy-Item .env.example .env   # потом впишите значения, см. ниже
npx prisma migrate dev
npm run seed
npm run dev
```

Значения для `.env`:

```
DATABASE_URL="file:../data/dev.db"
SESSION_DAYS=14
AI_DAILY_LIMIT=30
```

Сайт откроется на http://localhost:3000.

## Тестовые аккаунты

| Роль | Логин | Пароль |
|---|---|---|
| Студент 1 (группа МО-231) | student1 | demo-student-1 |
| Студент 2 (группа МО-231) | student2 | demo-student-2 |
| Студент 3 (группа МЭО-232) | student3 | demo-student-3 |
| Сотрудник деканата | staff | demo-staff-1 |

## Команды

- `npm run dev` запуск локально
- `npm run lint`, `npm run typecheck` проверка кода
- `npm test` тесты (используют отдельную базу `data/test.db`)
- `npm run seed` заполнить базу вымышленными данными (стирает старые)
