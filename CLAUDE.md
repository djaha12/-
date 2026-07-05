# ATELIER

Визуальная платформа для креативных специалистов недвижимости (КР → КЗ/УЗ).
Формула: портфолио → репутация → клиенты → рост. Приоритет №1 — UX/UI.

## Статус
M1 «Фундамент» ЗАВЕРШЁН: UX-флоу (docs/10), модель данных (docs/11 + packages/db, prisma validate ✓),
API-контракт (docs/12), события/уведомления (docs/13), дизайн-система, 3 эталонных экрана
(лента / профиль / кейс) — 3 цикла design-review, финал: ready без находок. Тесты core 15/15.
Следующий блок: M2 «Идентичность и контент» (auth, профили CRUD, кейсы, пайплайн изображений, i18n).

## Документы
- docs/02-phase1-plan.md — план MVP (M1–M7) · docs/03-decisions.md — решения (+§12 дефолты)
- docs/04-product-spec.md — спецификация · docs/10–13 — UX/данные/API/события
- docs/drafts/ — рабочие драфты и кросс-ревью M1 (superseded финальными 10–13)

## Стек и команды
Монорепо pnpm+Turborepo · apps/web: Next.js 15 + TS strict + Tailwind v4 + tRPC (M2) ·
packages/core (доменные правила, vitest) · packages/db (Prisma) · Meilisearch/Redis/MinIO — compose.
`pnpm install` → `pnpm gen:mock` → `pnpm dev` · `pnpm test|lint|typecheck|build` ·
`pnpm shots` (скриншоты 1440/390 × light/dark → screenshots/) ·
`docker compose -f docker-compose.dev.yml up -d` (M2+).

## Жёсткие принципы
- Никаких кредитных/процентных механик — никогда.
- Отзывы только по завершённым заказам (canSubmitReview), переходы заказа — canTransitionOrder.
- Конфликт «удобство vs скорость разработки» — в пользу удобства.
- Бизнес-инварианты живут ТОЛЬКО в packages/core; UI/API импортируют.
- Каждый блок: план → реализация → design-review (циклы по скриншотам) + code-review →
  доказательства (тесты, скриншоты) → коммит → показ Dars. Детали: .claude/skills/atelier-conventions.
