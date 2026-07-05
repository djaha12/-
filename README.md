# ATELIER (Ателье)

Визуальная платформа для креативных специалистов недвижимости: портфолио → репутация → клиенты → рост.
Рынок: Кыргызстан (Бишкек), далее Ош/регионы, Казахстан, Узбекистан.

## Стек
- **apps/web** — Next.js 15 (App Router) + TypeScript strict + Tailwind v4 + TanStack Query. SSR — обязательное
  требование (SEO публичных профилей).
- **packages/core** — доменные правила (чистый TS + vitest): отзывы только по завершённым заказам,
  state machine заказа, лимиты тарифов. Единственный источник бизнес-инвариантов.
- **packages/db** — Prisma + PostgreSQL (схема — по docs/11-data-model.md).
- Позже: **apps/services** (Fastify: WebSocket-чат, BullMQ-воркеры, Telegram-бот grammY), Meilisearch, R2.

## Команды
```bash
pnpm install          # + git hooks (lint+typecheck на pre-commit)
pnpm gen:mock         # арт-плейсхолдеры + blur-манифест (обязательно перед первым dev/build)
pnpm dev              # http://localhost:3000
pnpm test             # vitest (packages/core)
pnpm lint && pnpm typecheck
pnpm build
pnpm shots            # скриншоты всех экранов: 1440/390 × light/dark → screenshots/
docker compose -f docker-compose.dev.yml up -d   # Postgres, Redis, Meilisearch, MinIO (для M2+)
```

## Ключевые архитектурные решения
1. **Next.js вместо NestJS**: SSR-колокация + типы край-в-край; длинноживущие процессы (WS, очереди, бот)
   выносятся в отдельный лёгкий сервис. Обоснование: docs/00-prompt-analysis.md §3.
2. **Отзывы — только по завершённым заказам** (антинакрутка by design), переходы заказа — только через
   `canTransitionOrder` (packages/core), «сдан» предлагает специалист, подтверждает клиент.
3. **Никаких кредитных/процентных механик** — принципиально.
4. **Мок-изображения генерируются** (`scripts/gen-placeholders.mjs`): сеть окружения закрыта для фото-CDN,
   поэтому демо-контент — детерминированные арт-плейсхолдеры; в staging подставляются реальные фото.
5. **Дизайн-система** — токены в `apps/web/src/app/globals.css`, правила в
   `.claude/skills/atelier-conventions/`. Один терракотовый акцент, Manrope + Lora, dark mode с первого дня.

## Документация
- docs/02-phase1-plan.md — план MVP (M1–M7)
- docs/04-product-spec.md — продуктовая спецификация
- docs/10-ux-flows.md, 11-data-model.md, 12-api-contract.md, 13-events-notifications.md — проектирование M1
- CLAUDE.md — статус и процесс работы
