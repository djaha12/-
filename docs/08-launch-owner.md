# Запуск ATELIER — чек-лист владельца

Человеческий чек-лист поверх технического runbook (`docs/07-deploy-vercel.md`).
Пометки: **[ты]** — твой шаг (аккаунты, кнопки), **[я]** — делает Claude по runbook.
Секреты (`CRON_SECRET`, `ANON_REPORT_SALT`, `VAPID_*`) в репозиторий НЕ коммитятся —
они выдаются отдельно в чате или генерируются командами из `docs/07`.

## 0. Что решить до старта
- База: **Neon** (реком.) / Supabase
- Хранилище фото: **Vercel Blob** (реком.) / Cloudflare R2
- План Vercel: **Hobby** (бесплатно, 2 крона/сутки — хватает) / Pro
- Вход людей: **боевой** (Telegram Gateway, код в Telegram) / демо (тест-номера)
- Бренд в EN-интерфейсе: «Ателье» везде / «Atelier» латиницей
- Оплата PRO (Фаза 1.5): местные (Elcart/MBank/O!/FreedomPay) / карта

## 1. Аккаунты **[ты, ~20 мин]**
- [ ] Vercel — vercel.com, вход через GitHub
- [ ] Neon — neon.tech, создать проект (получишь Pooled и Direct строки)
- [ ] Vercel Blob — в проекте Vercel: Storage → Create → Blob
- [ ] (для реальных входов) Telegram Gateway — gateway.telegram.org, токен
- [ ] (по желанию) Telegram-бот — @BotFather, токен + username

## 2. Импорт и переменные **[ты]**
- [ ] Vercel → Add New → Project → репозиторий `djaha12/-`
- [ ] Раскрыть **Environment Variables**, вставить:
  - Готовые (выданы в чате): `CRON_SECRET`, `ANON_REPORT_SALT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
  - Из Neon: `DATABASE_URL` (Pooled, с `-pooler`), `DIRECT_URL` (без `-pooler`)
  - Из Blob: `BLOB_READ_WRITE_TOKEN` (появляется сам)
  - Свои: `SITE_URL` (домен или адрес Vercel)
- [ ] НЕ задавать `NODE_ENV`. НЕ включать `OTP_DEV_MODE` в Production.
- [ ] Deploy (первый может ругнуться на пустую базу — это нормально)

## 3. База и данные **[я]**
- [ ] Применить миграции к Neon (`prisma migrate deploy` по прямому URL)
- [ ] Сид справочников: города, районы, тарифы Free/PRO, промокод `ATELIER-LAUNCH`
      (`SEED_DEMO=0` — без фейкового каталога)
- [ ] Повысить твой аккаунт до роли MODERATOR (доступ к `/admin`)

## 4. Домен и крон **[ты + я]**
- [ ] **[ты]** Vercel → Domains → добавить домен, обновить DNS
- [ ] **[я]** Проверить `SITE_URL`, кроны (авто-подтверждение 3:00, дайджест 5:00 UTC)

## 5. Проверка вживую **[вместе]**
- [ ] Каталог не пустой
- [ ] Вход тест-номером (демо) или реальным (Gateway)
- [ ] Публикация кейса с фото (Blob отдаёт картинку)
- [ ] OG-карточка и `/sitemap.xml` на реальном домене
- [ ] Push включается в `/settings/notifications` (нужен HTTPS-домен)

## Реальные входы (важно про OTP)
Доставка кода в Telegram уже реализована — включается `TELEGRAM_GATEWAY_TOKEN`
в Production. Номера **без** Telegram смогут войти только после SMS-фолбэка
(отдельный провайдер КР — Фаза 1.5). Без токена — демо-режим на превью,
входят только тест-номера `+9967000XXXXX`.
