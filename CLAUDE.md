# ATELIER

Визуальная платформа репутации специалистов недвижимости (КР → КЗ/УЗ).
**Realtor-first**: риелторы — первая вертикаль (docs/05-realtors-first.md), остальные — вторая волна.
Формула: портфолио → репутация → клиенты → рост. Приоритет №1 — UX/UI.

## Статус
M1+R1+M2/M3+M4+M4.5+M5+**M6** завершены. Обе воронки живые поверх Postgres: заявка → тред →
заказ (условия подтверждает ТОЛЬКО клиент) → отзыв → бейдж «Сделка подтверждена клиентом»;
брифы → отклики (Free 10/мес из core) → чат. Авто-подтверждение: /api/cron/auto-confirm
(Bearer CRON_SECRET, fail-closed, актор system). Модерация (M5): trust-tiers — первые кейсы
NEW-автора в PENDING_REVIEW (чужим невидимы, автору — баннер статуса), 3 одобрения → TRUSTED;
жалобы с страницы кейса (гостям можно: anon-cookie, дедуп, 10/сутки); /admin для
MODERATOR/ADMIN (остальным 404): одобрить/отклонить с причиной, скрыть по жалобе = страйк,
3 страйка = frozenAt (контент-мутации 403); все действия в AuditLog транзакционно.
Инварианты в БД: один заказ = один бейдж (@unique), один активный заказ на тред, один отклик
на бриф. **M7**: SEO — metadata/canonical, OG-карточки и сторис-визитка 1080×1920 на лету
(next/og, «Поделиться» на кейсе), JSON-LD (RealEstateAgent/AggregateRating; кейс = CreativeWork,
НЕ Product), sitemap+robots; аналитика — AnalyticsOutbox (track в транзакциях, PostHog-воркер
позже) + дашборд /admin/stats (воронка 30д из таблиц, активность из outbox).
**M6**: уведомления — in-app центр (колокольчик в шапке) + Telegram-бот на вебхуке
(deep-link привязка, /stop; без токена деградирует в in-app); монетизация — лимиты Free
включены через core (5 кейсов/10 откликов), PRO промокодом (ATELIER-LAUNCH в сиде),
PRO-приоритет каталога + бейдж; PWA-манифест.
**M8** (инструментовка петли): событие `content_shared` от кнопки «Поделиться» (analytics.share,
publicProcedure, вайтлист surface/method/slug) → share-rate; атрибуция заявки — `?ref=` first-touch
в sessionStorage (RefCapture в layout) → source на `lead_created` (normalizeLeadSource в core:
direct/share/other); расшаренная ссылка несёт ?ref=share. Закрывает «слепоту петли» из
docs/06 §13.1 (share-rate и «визитка→заявка» раньше не мерились).
**M6.2**: онбординг специалиста — /onboarding (3 шага: имя+специализация, районы ≤5 из core,
Telegram+первый кейс), profiles.setup идемпотентен (редактирование), контакт-детект на
displayName/worksAt при записи, промоушен роли CLIENT→SPECIALIST; входы: шапка/футер//new без
профиля; /login?next= (валидация URL-парсером); владельцу профиля — «Настроить профиль».
**M10** (i18n-фундамент): ru/ky/en — typed-словари (ru источник типа), локаль в cookie БЕЗ
URL-префиксов (SEO ru-first, docs/03 §21), getDict()/useI18n, живой переключатель в футере,
<html lang>; переведён хром (шапка/футер/логин/лента/каталог) и **M10.2** карточки каталога и
ленты (trust-строка, специализации, бейджи сделок, валюта; pluralize по локали; deal-labels —
универсальный модуль: чистые функции нельзя звать из 'use client' на сервере) и **M10.3** страница
кейса (факты сделки, CTA, отзыв+подшкалы, ползунок до/после, форма жалобы целиком, галерея «Все N
фото», aria; metadata/OG/JSON-LD осознанно ru). Дальше по i18n: профиль/мастера.
Смоуки: M4 21/21, M4.5 24/24, M5 23/23, M6 20/20, M7 17/17, M8 9/9, M9 14/14, M10 19/19 (scripts/smoke-*.mjs). Тесты core 36/36.
Dev-БД: `pnpm db:start` (PG16 без Docker); `OTP_DEV_MODE=1` — код ТОЛЬКО тестовым +9967000XXXXX.
**Deploy-ready на Vercel** (docs/07): storage-абстракция Vercel Blob + FS-fallback (нет токена → ФС),
Prisma binaryTargets rhel + directUrl + generate в билде + fail-fast DATABASE_URL, next.config
(remotePatterns Blob / outputFileTracing движка+OG-шрифтов / security-headers), vercel.json cron,
клиентский downscale (лимит тела ~4.5 МБ), безопасность (песочница OTP гейт VERCEL_ENV, ANON_REPORT_SALT
fail-closed, /dev/ui скрыт), SEED_DEMO=0 = только справочники. Смоуки зелёные в prod-сборке.
OTP: Telegram Gateway реализован (server/otp-gateway.ts, вкл. TELEGRAM_GATEWAY_TOKEN; сбой доставки
расходует rate-limit — не self-DoS); без токена — демо через OTP_DEV_MODE на preview. SMS-фолбэк — Фаза 1.5.
Маркетинг: docs/06-go-to-market.md (GTM+SMM пилота, validation-first после двойной критики).
Дальше: i18n профиля/мастеров / web-push+дайджест / оплата (Фаза 1.5).

## Документы
- docs/02 план (M1–M7 + realtor-дельты) · docs/03 решения (§12 дефолты, §13 realtor-first,
  §16 M4, §17 M4.5, §18 M5, §19 M7, §20 M6)
- docs/04 спецификация · docs/05 вертикаль риелторов · docs/10–13 UX/данные/API/события
- Ключевой инвариант вертикали: бейдж «Подтверждено клиентом» — только через завершённый Order;
  кейс без Order легален, но без бейджа и вне агрегатов. Мы НЕ листинг-портал.

## Стек и команды
Монорепо pnpm+Turborepo · apps/web (Next.js 15, TS strict, Tailwind v4) · packages/core (vitest) ·
packages/db (Prisma, validate ✓) · `pnpm install && pnpm gen:mock && pnpm dev` ·
`pnpm test|lint|typecheck|build` · `pnpm shots` (скриншоты) · docker-compose.dev.yml (M2+).

## Жёсткие принципы
- Никаких кредитных/процентных механик; поля комиссии не существует.
- Отзывы только по завершённым заказам; переходы заказа — canTransitionOrder (packages/core).
- Точная цена сделки при RANGE/HIDDEN не отдаётся никогда; телефоны скрыты до заявки.
- Конфликт «удобство vs скорость» — в пользу удобства. Инварианты — только в packages/core.
- Каждый блок: план → реализация → design-review (циклы) + code-review → доказательства → коммит →
  показ Dars. Детали: .claude/skills/atelier-conventions.
