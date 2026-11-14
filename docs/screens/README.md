# Скриншоты «Мой деканат»

Файлы с `auto` в имени сделаны автоматически (Playwright, ширина 360 px или компьютер). Файлы с `deployed` и `mobile` сняты автором с телефона на развёрнутом сайте. Все данные вымышленные.

## Первые проверки (11 ноября)
- `00-student1-today.png`: экран «Сегодня», студент 1.
- `01-student2-today.png`: экран «Сегодня», студент 2, данные отличаются от студента 1.
- `02-login-lockout.png`: вход, ограничение числа попыток.
- `03-deployed-today-mobile.png`: «Сегодня» на развёрнутом сайте, с телефона.

## Автоматические экраны (360 px и компьютер)
- `04-auto-today-360px.png`: «Сегодня», 360 px.
- `05-auto-today-desktop.png`: «Сегодня», компьютер.
- `06-auto-profile-360px.png`: профиль.
- `07-auto-schedule-day-360px.png`: расписание, день.
- `08-auto-schedule-week-360px.png`: расписание, неделя.
- `09-auto-grades-360px.png`: учёба, оценки и долги.
- `10-auto-course-360px.png`: карточка дисциплины.
- `11-auto-foreign-course-404-360px.png`: чужая дисциплина даёт 404.
- `12-auto-requests-360px.png`: список заявок.
- `13-auto-request-form-error-360px.png`: форма заявки, ошибка проверки.
- `14-auto-request-detail-360px.png`: карточка заявки со статусами.
- `15-auto-notifications-360px.png`: уведомления.
- `16-auto-staff-360px.png`: раздел сотрудника, очередь заявок.
- `17-auto-assistant-360px.png`: страница помощника.
- `18-auto-today-ask-360px.png`: блок «Спроси деканат» на «Сегодня».

## Развёрнутый сайт, с телефона
- `09-deployed-grades-mobile.png`: учёба.
- `10-deployed-schedule-week-mobile.png`: расписание, неделя.
- `11-deployed-schedule-day-mobile.png`: расписание, день.
- `12-deployed-today-full-mobile.png`: «Сегодня» целиком.
- `13-deployed-requests-list-mobile.png`: список заявок.
- `14-deployed-request-detail-mobile.png`: карточка заявки.
- `15-deployed-profile-mobile.png`: профиль.
- `16-deployed-notifications-mobile.png`: уведомления.
- `17-deployed-assistant-stub-mobile.png`: помощник на заглушке.
- `18-deployed-staff-announcement-mobile.png`: сотрудник, объявление.
- `19-deployed-staff-requests-mobile.png`: сотрудник, заявки.

## Настоящая модель (12-13 ноября)
- `20-assistant-real-model-schedule-mobile.png`: ответ модели о расписании (ошибка «пар нет», записана в `docs/ai-errors.md`).
- `21-today-assistant-block-deadline-mobile.png`: блок помощника на «Сегодня», ответ про ближайший дедлайн.
- `22-requests-new-draft-box-mobile.png`: новая заявка, блок «Черновик с помощью ИИ».
- `23-student2-today-mobile.png`: «Сегодня» у студента 2.
- `24-assistant-schedule-fixed-mobile.png`: расписание на понедельник после исправления, считает код.
- `25-assistant-dialog-history-mobile.png`: диалог с историей вопросов, ссылки на разделы.

## Состояния и меню (автоматические, 360 px)
- `24-staff-menu-360px.png`: меню сотрудника.
- `25-loading-skeleton-360px.png`: состояние загрузки.
- `26-error-state-360px.png`: состояние ошибки.
- `27-empty-today-360px.png`: пустое «Сегодня».
- `28-empty-grades-360px.png`: пустая учёба.
- `29-staff-empty-filter-360px.png`: у сотрудника ничего не найдено по фильтру.
- `30-about-staff-360px.png`: страница «О проекте», тестовые аккаунты.
- `31-staff-announcement-form-360px.png`: форма объявления у сотрудника.

## Раздел 5 и тёмная тема (13 ноября, с телефона)
- `26-assistant-refusal-dark-mobile.png`: помощник отказывается показывать данные другого студента, тёмная тема.
- `27-search-results-dark-mobile.png`: поиск, результаты по своим данным, тёмная тема.
- `28-search-empty-dark-mobile.png`: поиск, пустое состояние, тёмная тема.
- `29-pwa-home-icon.jpg`: иконка «Мой деканат» (PWA) на главном экране телефона.
