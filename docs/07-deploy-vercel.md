# ATELIER — деплой на Vercel (runbook)

Что уже сделано в коде (этот блок) и что остаётся сделать тебе в аккаунтах Vercel/провайдеров.
Живой продукт — только `apps/web` (Next.js 15, App Router); отдельного сервиса воркеров/WS нет,
поэтому serverless-Vercel покрывает приложение целиком. Telegram — вебхук, уведомления — `after()`,
чат — tRPC (всё serverless-совместимо).

## Что уже готово в репозитории

- **Хранилище фото** — за абстракцией `apps/web/src/server/storage.ts`: есть `BLOB_READ_WRITE_TOKEN` →
  Vercel Blob (раздача с CDN), нет токена → локальная ФС (dev). EXIF/GPS срезает серверный `sharp`.
- **Prisma под serverless** — `binaryTargets` включает `rhel-openssl-3.0.x`; `directUrl` для миграций;
  `prisma generate` вшит в билд (`apps/web` build-скрипт) и в `postinstall` пакета db; `DATABASE_URL`
  fail-fast в проде.
- **next.config** — `remotePatterns` для Blob-домена; трейсинг движка Prisma и OG-шрифтов в лямбду;
  security-заголовки (anti-clickjacking, nosniff и т.д.).
- **Лимит тела Vercel (~4.5 МБ)** — мастер кейса даунскейлит фото на клиенте до загрузки.
- **Cron** — `apps/web/vercel.json` (авто-подтверждение раз в сутки); роут ждёт `Bearer $CRON_SECRET`
  (Vercel Cron шлёт его сам). Батч ограничен `take:200`, `maxDuration=60` (безопасно на всех планах).
- **Безопасность** — песочница OTP отключена в проде (гейт по `VERCEL_ENV`); `ANON_REPORT_SALT`
  fail-closed; `/dev/ui` скрыт в проде; нерабочие кнопки входа (Google/SMS) убраны.
- **Seed** — `SEED_DEMO=0` сеет только справочники (города/районы/тарифы/промокод), без демо-контента.
- **SITE_URL** — рантайм-переменная (без пересборки), с фолбэком на домен Vercel-проекта.

## Шаги деплоя (твой аккаунт)

1. **Postgres с пулером.** Заведи БД у провайдера с транзакционным пулером — **Neon** (рекомендую:
   serverless-native, ветки под preview) или Supabase. Запиши две строки:
   - пул (`:6543`, `pgbouncer=true`) → `DATABASE_URL` (рантайм),
   - прямую (`:5432`) → `DIRECT_URL` (миграции/seed).
2. **Импорт репо в Vercel.** New Project → **Root Directory = `apps/web`** → Framework: Next.js.
   Node.js Version = 22.x. Install/Build — дефолтные (`next build`; он сам гонит `prisma generate`).
3. **Blob Store.** Storage → Create Blob Store → Connect Project. `BLOB_READ_WRITE_TOKEN`
   инжектится автоматически во все окружения.
4. **Переменные окружения** (Settings → Environment Variables) — см. таблицу ниже. Все секреты
   генерируй `openssl rand -hex 32`. `NODE_ENV` не задавай.
5. **Миграции.** С прямым URL (не через пулер):
   `DATABASE_URL=<DIRECT_URL> pnpm --filter @atelier/db migrate:deploy`. Запускай из CI на push в main
   или локально; НЕ вшивай в Build Command без гейта (иначе preview-деплои мигрируют прод).
6. **Seed справочников (один раз).** С прямым URL:
   `DATABASE_URL=<DIRECT_URL> SEED_DEMO=0 pnpm --filter @atelier/db seed` — создаст города, районы,
   тарифы Free/PRO и промокод `ATELIER-LAUNCH` без фейкового каталога. Затем создай своего модератора
   (промоутни реального пользователя в роль `MODERATOR`).
7. **Домен.** Settings → Domains → добавь домен, обнови DNS. Значение = `SITE_URL`. После смены —
   Redeploy. Проверь `/sitemap.xml`, `/robots.txt`, og:image — реальный домен, не 127.0.0.1.
8. **Cron.** `vercel.json` уже в репо (два: авто-подтверждение 3:00 UTC и дайджест 5:00 UTC —
   лимит Hobby ровно 2 daily-крона). Убедись, что `CRON_SECRET` задан в Production **до** деплоя.
9. **Telegram (опционально).** Задай `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_TELEGRAM_BOT`; в `setWebhook` передай `secret_token = TELEGRAM_WEBHOOK_SECRET`.
   Без токена уведомления штатно деградируют в in-app.
10. **Web Push (опционально, M11).** Один раз: `npx web-push generate-vapid-keys` → задай
    `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (и по желанию `VAPID_SUBJECT`, `mailto:`-адрес).
    Без ключей push-секция в настройках скрыта, канал молчит — деградация как у Telegram.
11. **Проверка e2e.** После деплоя: каталог не пустой → вход тест-номером → создание кейса с фото
    (Blob отдаёт картинку, `next/image` рендерит) → ручной вызов `/api/cron/auto-confirm` и
    `/api/cron/digest` с Bearer → OG-карточка и sitemap на реальном домене → в
    `/settings/notifications` включается push (нужен HTTPS-домен, не превью-пароль).

## Матрица переменных окружения

| Переменная | Обяз. | Где | Значение |
|---|---|---|---|
| `DATABASE_URL` | да | Prod+Preview | ПУЛ-строка (`:6543`, `pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | да | Prod+Preview (миграции) | ПРЯМАЯ строка (`:5432`) |
| `SITE_URL` | да | Prod+Preview | `https://<домен>` (иначе фолбэк на домен Vercel) |
| `BLOB_READ_WRITE_TOKEN` | да (прод) | All | авто от Vercel Blob (иначе загрузка фото в проде падает) |
| `CRON_SECRET` | да | Production | `openssl rand -hex 32` (Vercel Cron шлёт как Bearer) |
| `ANON_REPORT_SALT` | да | Prod+Preview | `openssl rand -hex 32` (иначе жалобы гостей отключены) |
| `OTP_DEV_MODE` | нет | **только Preview/dev** | `1` — код на экран для тест-номеров; **не** в публичном Production |
| `SEED_DEMO` | нет | seed-команда | `0` — без демо-контента в проде |
| `TELEGRAM_BOT_TOKEN` | нет | Production | токен BotFather (без него — in-app) |
| `TELEGRAM_WEBHOOK_SECRET` | нет | Production | случайное; то же в `setWebhook` |
| `NEXT_PUBLIC_TELEGRAM_BOT` | нет | Production (билд) | username бота для deep-link |
| `VAPID_PUBLIC_KEY` | нет | Prod+Preview | `npx web-push generate-vapid-keys` (без пары — push скрыт) |
| `VAPID_PRIVATE_KEY` | нет | Prod+Preview | вторая половина пары |
| `VAPID_SUBJECT` | нет | Prod+Preview | `mailto:support@…` (дефолт зашит) |
| `NODE_ENV` | — | — | **не задавать** (Vercel ставит сам) |

## Решения, которые нужны от тебя

1. **Провайдер Postgres** — Neon (рекомендую) или Supabase. Оба дают пул + прямое соединение.
2. **Хранилище** — Vercel Blob (рекомендую под Vercel; абстракция уже готова) или Cloudflare R2
   (документированный вариант; потребует добавить R2-ветку в `storage.ts` + presigned URL).
3. **План Vercel** — Hobby (daily-cron достаточно) или Pro (нужен hourly-cron / больше функций).
4. **Реальная доставка OTP** — см. ниже. Это решает, «демо» деплой или «боевой».

## Известные ограничения (важно)

- **Вход реальных пользователей.** Доставка кода через **Telegram Gateway** реализована
  (`apps/web/src/server/otp-gateway.ts`), включается токеном:
  - **Боевой запуск:** заведи Telegram Gateway (gateway.telegram.org, ~$0.01/код), задай
    `TELEGRAM_GATEWAY_TOKEN` в Production — код уходит в Telegram по номеру, `requestOtp` при
    недоставке просит повторить. Для номеров **без Telegram** нужен SMS-фолбэк (отдельный
    провайдер-агрегатор КР — Фаза 1.5); пока такие номера войти не смогут.
  - **Демо/пилот:** без токена Gateway — `OTP_DEV_MODE=1` на Preview, входят только тест-номера
    `+9967000XXXXX` (в проде этот режим гейтом по `VERCEL_ENV` код не отдаёт — безопасно).
- **Prisma engine tracing** в pnpm-монорепо хрупок: если после деплоя первый запрос к БД-странице даёт
  `PrismaClientInitializationError: Query engine not found` — добавь
  `@prisma/nextjs-monorepo-workaround-plugin` (webpack-плагин копирует движок) или Prisma driver
  adapters. Трейсинг-глоб в `next.config.ts` покрывает штатный случай.
- **In-memory rate-limit** (`analytics.share`, частично OTP) на serverless слабее — память на инстанс,
  сброс на cold start. Для боевого антиспама вынести окно в Upstash Redis / Vercel KV (INCR+EXPIRE).
- **Vercel Blob** — вендор-лок в хранилище Vercel; если архитектурно важен Cloudflare R2 (docs/03),
  это технический долг миграции хранилища.
- **Preview с демо-сидом.** Публичный preview с `OTP_DEV_MODE=1` + демо-seed позволяет войти
  засеянным демо-модератором (это ожидаемо для теста). Не выставляй такой preview как публичный прод.
