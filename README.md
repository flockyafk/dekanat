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

Значения для `.env` (без ключа помощник работает на заглушке с готовыми ответами):

```
DATABASE_URL="file:../data/dev.db"
SESSION_DAYS=14
AI_DAILY_LIMIT=30
# Реальная модель (Amvera LLM). Ключ только здесь, файл .env не попадает в git:
AI_PROVIDER=amvera
AI_API_KEY=<ключ из кабинета Amvera, раздел LLM>
AI_MODEL=qwen3_30b
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
- `npm test` тесты (отдельная база `data/test.db`, помощник на заглушке, к реальной модели не ходят)
- `npm run e2e` сценарий жюри (раздел 13 ТЗ) на ширине 360 px, отдельные база и порт 3200. С реальной моделью: `$env:E2E_REAL_AI="1"; $env:AI_MODEL="qwen3_30b"; npm run e2e`
- `npm run redteam` красная команда на реальной модели (27 атак, тратит около 70 тысяч токенов), отчёт в `docs/redteam-results.md`
- `npm run seed` заполнить базу вымышленными данными (стирает старые)
