# ATELIER

Визуальная платформа для креативных специалистов недвижимости (КР → КЗ/УЗ).
Формула: портфолио → репутация → клиенты → рост. Приоритет №1 — UX/UI.

## Статус
Фаза 0: анализ + план готовы, ожидают подтверждения Dars. Кода нет.

## Документы
- docs/00-prompt-analysis.md — противоречия/пробелы ТЗ и принятые техрешения
- docs/01-questions.md — открытые вопросы к Dars (с дефолтами)
- docs/02-phase1-plan.md — план MVP: милстоуны M1–M7, процесс блоков, DoD

## Утверждаемый стек (детали в docs/00, раздел 3)
Монорепо pnpm+Turborepo · apps/web: Next.js 15 + TS strict + Tailwind + shadcn +
TanStack Query + tRPC · apps/services: Fastify (WS-чат, BullMQ, Telegram-бот grammY) ·
packages/db (Prisma+Postgres), core (доменная логика), i18n (ru/ky/en), config ·
Meilisearch · Redis · R2+sharp (EXIF-strip, AVIF/WebP, blurhash) · PostHog · Sentry.

## Жёсткие принципы
- Никаких кредитных/процентных механик — никогда не предлагать.
- Отзывы только по завершённым заказам внутри платформы.
- Конфликт «удобство vs скорость разработки» решается в пользу удобства.
- Каждый блок: план → реализация → design-review + code-review → доказательства
  (тесты, скриншоты 1440/390 × light/dark через `pnpm shots`) → коммит → показ Dars.

## Команды
Пока нет (появятся в блоке M1.3 — бутстрап).
