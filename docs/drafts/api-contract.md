# ATELIER — контракт API MVP (draft)

Статус: draft на ревью. Источники: `docs/04-product-spec.md` (истина), `docs/03-decisions.md`,
`docs/00-prompt-analysis.md`, `docs/drafts/schema.prisma` + `data-model-notes.md` (имена сущностей,
state machine заказа, инварианты). Все доменные правила из этого документа живут в `packages/core`
и вызываются из процедур в одной транзакции с записью.

## 0. Транспорт и общие конвенции

- **tRPC** (роутеры в `apps/web`, `/api/trpc`), superjson, интеграция с TanStack Query.
  Типы край-в-край; будущий React Native использует те же роутеры.
- **Чистые REST route handlers** — только вебхуки (Telegram, платёжки), OG-изображения,
  Google OAuth redirect-flow (§16).
- **WebSocket** — `apps/services` (Fastify), события чата и уведомлений (§17).
- **Сессии**: httpOnly-cookie (`atelier_session`, SameSite=Lax, 90 дней, sliding). Контекст tRPC:
  `{ user | null, entitlement, trustTier, anonId }`. `anonId` — cookie гостя для аналитики и view-дедупликации.
- **Роли в колонке «права»**: `guest` (без сессии), `client`, `specialist`, `owner` (владелец конкретного
  ресурса), `participant` (сторона заказа/треда), `moderator`, `admin`. `admin ⊇ moderator`.
  Гость видит ленту/кейсы/профили/поиск без регистрации; мутации ценности (save, заявка) возвращают
  `UNAUTHORIZED` с `reason: "auth_required"` — фронт открывает регистрацию «в момент ценности».
- **Ошибки**: tRPC-коды (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `PRECONDITION_FAILED`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`) + shape
  `{ code, messageKey, message, details? }`. `message` — человеческий русский текст
  («Код не подошёл. Осталось 2 попытки», не «OTP_INVALID»); `messageKey` — ключ i18n для ky/en.
- **Деньги**: всегда целые сомы (Int, KGS). USD — только отображение, курс отдаёт `feed.meta`/`profiles.publicBySlug`.
- **Аналитика**: каждая значимая процедура пишет событие в `AnalyticsOutbox` в той же транзакции
  (transactional outbox → воркер → PostHog). Имена — snake_case, указаны у процедур.
- **Запрещено навсегда**: кредитные/процентные механики. В API нет и не будет процедур escrow,
  комиссий, рассрочек; `agreedAmount` — информационное поле.

## 1. Пагинация (cursor)

Единый паттерн для всех списков:

```
вход:  { cursor?: string, limit?: number (1..50, default 20), ...фильтры }
выход: { items: T[], nextCursor: string | null }
```

- `cursor` — opaque base64url от keyset-пары, напр. `{"v":"2026-07-01T10:00:00Z","id":"cml..."}`.
  Клиент не разбирает курсор. `nextCursor: null` = конец.
- Keyset, не offset: лента `(publishedAt DESC, id DESC)`, чат `(createdAt ASC, id ASC)`,
  уведомления `(createdAt DESC, id DESC)` — стабильно при вставках, соответствует индексам схемы.
- Исключения: `search.*` — Meilisearch пагинируется `offset/limit` (курсор кодирует offset,
  внешне контракт тот же); лента «релевантность» — снапшот-курсор `{gen, offset}` (§5).
- Смена фильтров = сброс курсора (валидируется: курсор несёт hash фильтров, mismatch → `BAD_REQUEST`
  «Фильтры изменились — обновите ленту»).

## 2. Идемпотентность мутаций

- Создающие мутации принимают опциональный `idempotencyKey: string (uuid v4)`:
  `orders.create`, `orders.transition`, `reviews.create`, `cases.submit`, `chat.send`,
  `briefs.respond`, `billing.redeemPromo`, `orders.addCheckpoint`.
- Механика: Redis `SETNX idem:{userId}:{key}` → по завершении сохраняем `{inputHash, response}` (TTL 24 ч).
  Повтор с тем же ключом и тем же входом → сохранённый ответ (без побочных эффектов);
  тот же ключ + другой вход → `CONFLICT` «Похоже, запрос отправился дважды с разными данными».
- Естественная идемпотентность через unique-констрейнты БД (повтор → текущее состояние, не ошибка):
  like/save (`@@unique(userId, caseId)`), отклик на бриф (`@@unique(briefId, specialistId)`),
  отзыв (`Review.orderId @unique`), follow, membership.
- Переходы заказа дополнительно защищены полем `expectedState` (optimistic concurrency):
  состояние изменилось между чтением и кликом → `PRECONDITION_FAILED` «Заказ уже в другом статусе — обновите страницу».

## 3. Rate limits

Redis sliding window, ключи по `userId` (авторизован) или `IP+anonId` (гость).
Превышение → `TOO_MANY_REQUESTS` + `retryAfterSec`; текст человеческий («Слишком часто. Попробуйте через минуту»).

| Область | Лимит |
|---|---|
| `auth.requestOtp` | 1/мин и 5/час на телефон; 10/сутки на IP; повторный запрос до `retryAfterSec` → та же ошибка |
| `auth.verifyOtp` | 5 попыток на challenge, затем challenge аннулируется |
| `chat.send` | 30/мин на пользователя; 5 первых сообщений/час новым (`trustTier=NEW`) незнакомым адресатам — антиспам |
| `briefs.respond` | 20/сутки поверх лимита плана |
| `reviews.create` | 5/сутки на пользователя (velocity поверх — §11) |
| `cases.*` мутации | 60/мин; `requestImageUpload` 30/мин, 200/сутки |
| `moderation.report` | 20/сутки |
| `search.query` | 60/мин гость, 120/мин авторизованный |
| `feed.trackView` | батчи, максимум 1 view на (case, anonId/userId) в сутки |
| Глобально guest read | 300/мин на IP (защита от скрейпинга портфолио) |
| Мутации по умолчанию | 120/мин на пользователя |

## 4. Автоскрытие контактов в публичном контенте

Решение 03/7: телефоны/мессенджеры/ссылки скрываются в **публичном** контенте, в чате — свободно.

- Детектор `core/contacts.detect()`: телефоны (в т.ч. `0(555)-12-34-56`, `+996…`, «ноль пятьсот…»),
  `@username`, ссылки t.me/wa.me/instagram, e-mail, обфускации («тел в профиле инсты»).
- **Применение на чтение**: публичные выборки прогоняют поля через `core/contacts.hide()` →
  замена на `[контакт скрыт — напишите в чат]`. Оригинал в БД не портится (модератору виден).
- **Применение на запись**: детект при создании/обновлении → предупреждение в UI
  (`warnings: ["contacts_hidden"]` в ответе мутации); ≥3 срабатываний за 7 дней →
  `ModerationItem(CONTACT_LEAK)`.
- Санитизируемые поля: `Case.title/description`, `CaseImage.caption`, `Brief.title/description`,
  `BriefResponse.message`, `Review.text`, `SpecialistProfile.headline/bio`, названия коллекций.
- НЕ санитизируются: `Message.text` (чат свободен), контент заказа между сторонами, поля для владельца.

---

## 5. Модуль `feed`

### feed.list — query
- **Вход**: `{ cursor?, limit?, sort?: 'relevance' | 'fresh' (default 'relevance'), filters?: { specialization?: Specialization, styleSlugs?: string[] (≤5), citySlug?: string, categorySlug?: string, budgetMin?: int, budgetMax?: int, hasBeforeAfter?: boolean } }`
- **Выход**: `{ items: FeedCard[], nextCursor }`, где `FeedCard = { caseId, slug, title, cover: {variants, blurhash, w, h}, author: {slug, displayName, avatarUrl, specialization, isVerified}, likesCount, savesCount, viewerState: {liked, saved} | null, promoted: boolean }`
- **Права**: guest+ (viewerState = null у гостя).
- **Ранжирование `relevance`** — формула recency+engagement, пересчёт BullMQ-воркером каждые 30 мин
  для кейсов моложе 30 дней, результат — Redis ZSET c номером поколения `gen`:

  ```
  hotScore = 0.65 · exp(−Δt / 72) + 0.35 · min(1, ln(1 + L + 2·S + 0.05·V) / ln(500))
  Δt — часы с publishedAt; L/S/V — likesCount/savesCount/viewsCount;
  сохранения весят вдвое больше лайков (save = намерение, «момент радости»);
  кейсы старше 30 дней — хвост по publishedAt DESC.
  ```

  Курсор `relevance` = `{gen, offset}` — страница читается из того же поколения ZSET (нет дублей/дыр
  при пересчёте); поколение протухло (>2 ч) → `BAD_REQUEST` «Лента обновилась — потяните вниз».
  `fresh` — честный keyset `(publishedAt, id)` из Postgres.
- **Буст**: максимум 1 кейс из активных `BoostCampaign` на каждые 12 позиций, всегда `promoted: true`
  (в UI — пометка «продвижение»). Инкремент `impressionsCount` — батчем.
- **Ошибки**: некорректные фильтры → `BAD_REQUEST` («Неизвестный город»).
- **Аналитика**: `feed_viewed {sort, filters, page}`, `boost_impression {campaignId}`.

### feed.meta — query
- **Вход**: `{}` → **Выход**: `{ cities, styles, categories, specializations, usdRate: {rate, rateDate} }` — справочники фильтров + курс НБКР (кэш сутки). **Права**: guest+.

### feed.trackView — mutation
- **Вход**: `{ caseId }` → **Выход**: `{ ok: true }`. Дедуп в Redis (сутки), инкремент `viewsCount` батчем.
- **Права**: guest+ (по anonId). **Аналитика**: `case_viewed {caseId, source}`.

---

## 6. Модуль `auth`

### auth.requestOtp — mutation
- **Вход**: `{ phone: string /* E.164, +996… */ }`
- **Выход**: `{ challengeId, channel: 'telegram' | 'sms', retryAfterSec: 60, codeLength: 6 }`
  Канал выбирает `OtpChannel`-абстракция (решение 03/2): Telegram Gateway первичный, SMS fallback, mock в dev.
- **Права**: guest+. **Rate limit**: см. §3 — самый строгий в системе.
- **Ошибки**: `BAD_REQUEST` «Проверьте номер — формат +996 XXX XXX XXX»; `TOO_MANY_REQUESTS`
  «Код уже отправлен. Повторно — через 60 секунд». Существование аккаунта НЕ раскрывается.
- **Аналитика**: `otp_requested {channel}`.

### auth.verifyOtp — mutation
- **Вход**: `{ challengeId, code: string(6), profile?: { displayName: string(2..50), role: 'CLIENT' | 'SPECIALIST' } /* только для новых */ }`
- **Выход**: `{ user: SessionUser, isNewUser: boolean, needsOnboarding: boolean }` + установка session-cookie.
  Новый пользователь без `profile` → `{ isNewUser: true, needsProfile: true }` (двухшаговая регистрация).
  Специалисту создаётся пустой `SpecialistProfile` (slug из транслита имени), онбординг ведёт мастер.
- **Права**: guest. **Ошибки**: «Код не подошёл. Осталось N попыток»; «Код устарел — запросите новый»
  (`PRECONDITION_FAILED`); после 5 попыток challenge гасится.
- **Аналитика**: `otp_verified`, `user_registered {role}` (для новых), `session_started`.

### auth.session — query
- **Вход**: `{}` → **Выход**: `{ user: SessionUser | null }`,
  `SessionUser = { id, role, displayName, avatarUrl, phoneVerified, trustTier, locale, telegramLinked, plan: {code, limits}, unreadNotifications, unreadMessages }`. **Права**: guest+.

### auth.logout — mutation
- `{}` → `{ ok }`; гасит сессию. **Права**: любой авторизованный.

### auth.linkTelegram — mutation
- **Вход**: `{}` → **Выход**: `{ deepLink: "https://t.me/<bot>?start=<oneTimeToken>", expiresInSec: 600 }`.
  Токен одноразовый; бот по `/start token` привязывает `telegramChatId` (вебхук §16) и шлёт приветствие.
  First-class шаг онбординга (риск 00/1.8 — iOS push). **Права**: client, specialist.
- **Аналитика**: `telegram_link_requested`, `telegram_linked` (из вебхука).

### Google OAuth
Redirect-flow — REST (§16): `GET /api/auth/google` → consent → `GET /api/auth/google/callback` →
сессия + cookie. Google-аккаунт создаётся с `phoneVerifiedAt = null`: смотреть/сохранять можно,
а отклики, заявки и заказы требуют телефона — UI ведёт на `auth.requestOtp` в момент ценности.
tRPC-дополнение: **auth.linkPhone** — mutation, привязка телефона к текущему аккаунту
(тот же flow requestOtp/verifyOtp с `mode: 'link'`); телефон занят другим аккаунтом → `CONFLICT`
«Этот номер уже привязан к другому аккаунту — войдите через него».

---

## 7. Модуль `profiles`

### profiles.my — query
- `{}` → полный собственный профиль: `{ user, specialistProfile? | clientProfile?, orgMembership?: {orgName, isConfirmed}, verifications: [{kind, status}], counters }`. **Права**: client, specialist.

### profiles.update — mutation
- **Вход** (specialist): `{ displayName?, avatarUploadId?, headline?: string(..120), bio?: string(..2000), specialization?, cityId?, districtId?, styleIds?: string[](..8), priceMin?: int≥0, priceMax?: int≥priceMin, priceUnit?: 'PER_M2'|'PER_PROJECT'|'PER_HOUR', acceptsOrders?: boolean, coverUploadId?, locale?, worksAtOrgName?: string /* метка «работает в X», MVP */ }`;
  клиенту доступны только `displayName, avatarUploadId, cityId, locale`.
- **Выход**: обновлённый профиль + `warnings?: ["contacts_hidden"]` (детект контактов в bio/headline — §4).
- **Права**: owner. **Ошибки**: `BAD_REQUEST` «Максимальная цена меньше минимальной»; slug занят → `CONFLICT`.
- **Аналитика**: `profile_updated {fields}`, `accepts_orders_toggled {value}`.

### profiles.publicBySlug — query
- **Вход**: `{ slug }` → **Выход**: `{ profile: { slug, displayName, avatarUrl, coverUrl, specialization, headline, bio /* контакты скрыты §4 */, city, district, styles, priceRange: {min, max, unit, usd: {min,max}}, acceptsOrders, badges: {identityVerified, businessVerified}, worksAt?: {orgName, isVerified} }, reputation: ReviewAggregate-снимок { avgOverall, reviewsCount, подшкалы, completedOrdersCount, repeatClientsPct }, cases: первая страница published-кейсов, viewerState: {following} | null }`
  SSR-страница `/{slug}` (SEO, schema.org Person/LocalBusiness) читает эту же процедуру.
- **Права**: guest+. Телефона в ответе НЕТ ни при каких условиях (скрыт до заявки).
- **Ошибки**: `NOT_FOUND` «Такого профиля нет или он скрыт».
- **Аналитика**: `profile_viewed {slug, source}` (+ инкремент `viewsCount` батчем).

### profiles.stats — query
- **Вход**: `{ period: '7d' | '30d' | '90d' }` → **Выход**: `{ views: {profile, cases, series[]}, saves, likes, requestsStarted /* открытые заявки-чаты */, conversion: {viewToRequestPct}, topCases: [{caseId, title, views, saves}] }`.
  Free — сводка за 7 дней; полнота и период — по `hasAnalytics` плана (PRO), иначе `FORBIDDEN`
  «Расширенная аналитика доступна на PRO».
- **Права**: owner (specialist). **Аналитика**: `stats_viewed {period}`.

### profiles.follow / profiles.unfollow — mutation
- `{ userId }` → `{ following: boolean, followersCount }`. Идемпотентно (unique). Нельзя подписаться на себя → `BAD_REQUEST`. **Права**: client, specialist. **Аналитика**: `specialist_followed`.

### profiles.requestVerification — mutation
- **Вход**: `{ kind: 'IDENTITY' | 'BUSINESS', documentUploadIds: string[](1..5) }` (загрузка — presigned flow §8, приватный бакет).
- **Выход**: `{ verificationId, status: 'PENDING' }`. Создаёт `ModerationItem(VERIFICATION)`.
- **Права**: specialist (BUSINESS также владелец организации). Повторная заявка при PENDING → `CONFLICT` «Заявка уже на проверке».
- **Аналитика**: `verification_requested {kind}`.

---

## 8. Модуль `cases`

Флоу: `createDraft → update (автосейв) → requestImageUpload → PUT в R2 → attachImage → … → submit`.

### cases.createDraft — mutation
- **Вход**: `{}` (пустой черновик — мастер «кейс за 5 минут» стартует мгновенно)
- **Выход**: `{ caseId, slug }`. **Права**: specialist. Черновики не лимитируются (лимит Free — на published).
- **Аналитика**: `case_draft_created`.

### cases.update — mutation (автосохранение, debounce 2 с на клиенте)
- **Вход**: `{ caseId, patch: { title?: string(..120), description?: string(..5000), categoryId?, cityId?, districtId?, areaM2?: number(0..100000), budgetMin?: int, budgetMax?: int, srokDays?: int(1..3650), authorRole?: CaseAuthorRole, styleIds?: string[](..5), tags?: string[](..10), hasPublishRights?: boolean } }`
- **Выход**: `{ case, savedAt, warnings? }`. Патч частичный; контакт-детект → warning (§4).
- **Права**: owner; статус `DRAFT | REJECTED` (published правится через `unpublish`). Иначе `PRECONDITION_FAILED` «Опубликованный кейс сначала снимите с публикации».
- **Аналитика**: — (шумно; фиксируем только `case_submitted`).

### cases.requestImageUpload — mutation (presigned URL)
- **Вход**: `{ caseId?: string /* или scope: 'avatar'|'cover'|'chat'|'review'|'checkpoint'|'verification' */, contentType: 'image/jpeg'|'image/png'|'image/webp'|'image/heic', sizeBytes: int(..25MB) }`
- **Выход**: `{ uploadId, uploadUrl /* presigned PUT R2, TTL 10 мин */, storageKey }`
- Клиент делает `PUT uploadUrl` напрямую в R2 (мимо приложения), затем подтверждает attach'ем.
- **Права**: owner scope. **Ошибки**: «Файл слишком большой — до 25 МБ»; «Формат не поддерживается».
- **Аналитика**: `upload_requested {scope}`.

### cases.attachImage — mutation
- **Вход**: `{ caseId, uploadId, caption?: string(..300), isBeforeImage?: boolean, beforeAfterGroup?: string, sortOrder?: int }`
- **Выход**: `{ image: { id, status: 'PROCESSING' } }`. Ставит BullMQ-задачу: sharp → **EXIF/GPS-стрип**
  (приватность — обязательное требование), варианты 400/800/1600 AVIF+WebP, blurhash, pHash.
  Готовность — poll `cases.byId` или WS `upload.processed`. pHash-совпадение с чужим published-кейсом
  → изображение помечается, создаётся `ModerationItem(PHASH_DUPLICATE)` (публикацию не блокирует — решает модератор).
- **Права**: owner. Лимит 20 изображений на кейс → `BAD_REQUEST` «В кейсе до 20 фото».
- **Аналитика**: `case_image_uploaded {caseId, n}`.

### cases.updateImage / cases.removeImage / cases.reorderImages — mutation
- `{ imageId, patch: {caption?, isBeforeImage?, beforeAfterGroup?} }` / `{ imageId }` / `{ caseId, imageIds: string[] }`.
  Инвариант пары «до/после»: в группе ровно одна `isBeforeImage=true` и одна `false` — проверка на submit.
- **Права**: owner.

### cases.submit — mutation (submit → publish в одном действии; идемпотентна)
- **Вход**: `{ caseId, idempotencyKey? }`
- **Выход**: `{ status: 'PUBLISHED' | 'PENDING_REVIEW', publishedAt? }`
- **Проверки `packages/core` в одной транзакции**:
  1. ≥1 обработанное изображение; заполнен `title`; `hasPublishRights === true`
     (иначе `PRECONDITION_FAILED` «Подтвердите права на публикацию фото»);
  2. пары «до/после» валидны;
  3. **Лимит Free**: `count(published) < plan.maxPublishedCases (Free=5, PRO=null)` →
     иначе `FORBIDDEN` `{ messageKey: 'limits.cases', message: 'На Free — до 5 опубликованных кейсов. Архивируйте один или подключите PRO', details: {used: 5, max: 5} }`;
  4. **Trust-tier** (решение 03/4): `NEW` (первые 3 кейса) → `PENDING_REVIEW` + `ModerationItem(NEW_USER_PREMOD)`,
     UI честно: «Кейс на быстрой проверке — обычно до 2 часов»; `TRUSTED/VERIFIED` → сразу `PUBLISHED`
     + индексация в Meilisearch + `Notification(CASE_PUBLISHED)`.
- **Права**: owner (specialist). **Аналитика**: `case_submitted {caseId}`, `case_published {caseId, premod: bool}`.

### cases.unpublish / cases.archive / cases.delete — mutation
- `{ caseId }`. `unpublish` → DRAFT (правки), `archive` → ARCHIVED (освобождает слот Free),
  `delete` → soft-delete. Убирают из Meili/лент. **Права**: owner. **Аналитика**: `case_unpublished {to}`.

### cases.publicBySlug — query
- **Вход**: `{ slug }` → **Выход**: `{ case /* контакты в тексте скрыты §4 */, images: [{variants, blurhash, caption, beforeAfter}], author: карточка, collaborators: только ACCEPTED [{user, role}], styles, tags, budget: {min, max, usd}, counters, viewerState: {liked, saved, savedToCollections: string[]} | null, related: FeedCard[](6) }`
  SSR `/case/{slug}` + OG-карточка (§16). Черновик/архив по прямой ссылке → `NOT_FOUND` для всех, кроме owner/moderator.
- **Права**: guest+. **Аналитика**: `case_opened {slug, source}`.

### cases.myList — query
- `{ status?: CaseStatus, cursor?, limit? }` → черновики/на проверке/опубликованные + счётчик слотов
  `{ items, nextCursor, slots: {used, max: number | null} }`. **Права**: owner (specialist).

### cases.like / cases.unlike — mutation
- `{ caseId }` → `{ liked, likesCount }`. Идемпотентно. **Права**: client, specialist
  (guest → `UNAUTHORIZED` + `auth_required` — момент регистрации). **Аналитика**: `case_liked`.

### cases.inviteCollaborator — mutation
- **Вход**: `{ caseId, userSlugOrPhone: string, role: CaseAuthorRole }` — команда проекта, совместные кейсы.
- **Выход**: `{ collaborator: {status: 'INVITED'} }` + `Notification(COLLAB_INVITED)`.
- **Права**: owner. Приглашённый не специалист платформы → `NOT_FOUND` «Коллега ещё не в ATELIER — пришлите ему ссылку-приглашение» (`details.inviteUrl`).
- **Аналитика**: `collab_invited`.

### cases.respondCollaboration — mutation
- `{ caseId, accept: boolean }` → `{ status }`. ACCEPTED → кейс появляется в профиле коллеги
  («рейтинг растёт у всех»). **Права**: приглашённый. **Аналитика**: `collab_responded {accept}`.

---

## 9. Модуль `collections`

### collections.saveCase — mutation («момент радости», регистрация в момент ценности)
- **Вход**: `{ caseId, collectionId?: string /* без него — коллекция по умолчанию «Сохранённое» */, caseImageId?: string }`
- **Выход**: `{ saved: true, collection: {id, title}, savesCount }`. Создаёт `Save` + `CollectionItem` (оба идемпотентны).
- **Права**: client, specialist; guest → `UNAUTHORIZED {reason: 'auth_required'}`.
- **Аналитика**: `case_saved {caseId, collectionId}` — ключевое событие воронки.

### collections.unsaveCase — mutation
- `{ caseId, collectionId? /* без него — убрать отовсюду */ }` → `{ saved: false, savesCount }`. **Права**: owner Save.

### collections.list — query
- `{ userId? /* чужие — только публичные */, cursor?, limit? }` → `{ items: [{id, title, isPrivate, itemsCount, covers: blurhash-превью 4 шт}], nextCursor }`. **Права**: owner — все свои; guest+ — публичные чужие.

### collections.byId — query
- `{ collectionId, cursor?, limit? }` → `{ collection, items: [{case: FeedCard, caseImage?, sortOrder}], nextCursor }`.
  Приватная чужая → `NOT_FOUND` (не `FORBIDDEN` — не раскрываем существование). **Права**: owner | guest+ (публичные).

### collections.create / update / delete — mutation
- `{ title: string(1..60), isPrivate?: boolean }` / `{ collectionId, patch }` / `{ collectionId }` (soft-delete).
  Название проходит контакт-детект (§4). Лимит 50 коллекций. **Права**: client, specialist / owner.
- **Аналитика**: `collection_created`.

### collections.reorderItems — mutation
- `{ collectionId, itemIds: string[] }` → `{ ok }`. **Права**: owner.

---

## 10. Модуль `search` (Meilisearch за абстракцией SearchService)

Два индекса, синхронизируются воркером из Postgres (истина — Postgres):

| Индекс | Документ | searchable | Фасеты (filterable) | sortable |
|---|---|---|---|---|
| `cases` | published-кейсы | title, description, tags, styles, authorName, city | specialization, citySlug, districtSlug, styleSlugs, categorySlug, budgetBucket (`<0.5M / 0.5–1.5M / 1.5–3M / 3M+ сом`), hasBeforeAfter | publishedAt, hotScore |
| `specialists` | активные профили | displayName, headline, bio, styles, city | specialization, citySlug, styleSlugs, priceBucket, acceptsOrders, identityVerified, ratingBucket (4.5+/4+/3+) | avgOverall, reviewsCount |

Типо-толерантность Meili — из коробки (смешанный ру/кыр ввод); синонимы ру/кыр/латиница
(«дизайнер» ≈ «dizainer») — словарь в конфиге индекса.

### search.query — query
- **Вход**: `{ q: string(0..200), type: 'cases' | 'specialists', filters?: { как фасеты выше }, sort?: 'relevance' | 'fresh' | 'rating', cursor?, limit? }`
- **Выход**: `{ items: FeedCard[] | SpecialistCard[], nextCursor, facets: { citySlug: {bishkek: 120, osh: 14}, styleSlugs: {...}, ... }, totalEstimate }`
  — `facets` рисуют счётчики фильтров. Пустой `q` = браузинг по фасетам (валидно).
- **Права**: guest+. **Ошибки**: Meili недоступен → `INTERNAL_SERVER_ERROR` «Поиск временно отдыхает — попробуйте через минуту» (фронт откатывается на `feed.list`).
- **Аналитика**: `search_performed {q_len, type, filters, results}`, `search_zero_results {q}` (сигнал для синонимов).

### search.suggest — query
- `{ q: string(1..100) }` → `{ suggestions: [{type: 'case'|'specialist'|'style'|'city', label, slug}] (≤8) }` — автокомплит, debounce на клиенте. **Права**: guest+.

---

## 11. Модуль `briefs`

### briefs.create — mutation
- **Вход**: `{ title: string(5..120), description?: string(..3000), objectType: BriefObjectType, specialization?: Specialization, cityId?, areaM2?, budgetMin?: int, budgetMax?: int, timelineDays?: int, referenceCollectionId?: string /* мудборд */, publish?: boolean (default true) }`
- **Выход**: `{ brief, warnings? }`. `publish: true` → сразу `OPEN` (черновики брифов вторичны).
  Референс-коллекция принудительно публичная или копия-снапшот — специалисты должны видеть.
  Описание — контакт-детект (§4).
- **Права**: client, specialist-как-клиент; guest → `auth_required`. Телефон верифицирован — иначе
  `PRECONDITION_FAILED` «Подтвердите телефон, чтобы специалисты могли откликнуться».
- **Аналитика**: `brief_created {objectType, hasBudget, hasReferences}`.

### briefs.update / briefs.close — mutation
- `{ briefId, patch }` / `{ briefId }` → `CLOSED` (отклики закрыты, треды живут). **Права**: owner.
- **Аналитика**: `brief_closed {responsesCount}`.

### briefs.listOpen — query (витрина для специалистов)
- **Вход**: `{ filters?: { specialization?, citySlug?, objectType?, budgetMin?, budgetMax? }, cursor?, limit? }`
- **Выход**: `{ items: [{brief /* контакты скрыты §4 */, client: {displayName, avatarUrl, city, completedOrdersCount /* лёгкая репутация клиента */}, responsesCount, viewerState: {responded} | null}], nextCursor }`
- **Права**: specialist (лента брифов — ценность платформы; guest/client видят только счётчик «N открытых брифов»).
- **Аналитика**: `briefs_feed_viewed {filters}`.

### briefs.byId — query
- `{ briefId }` → бриф + референсы (items коллекции) + для owner'а — отклики. **Права**: owner, откликнувшийся specialist, moderator. Прочим — `NOT_FOUND`.

### briefs.respond — mutation
- **Вход**: `{ briefId, message: string(20..2000), priceEstimate?: int, idempotencyKey? }`
- **Выход**: `{ response: {id, status: 'SENT'}, limits: {usedThisMonth, max} }`
- **Проверки core**: бриф `OPEN`; один отклик на бриф (unique — повтор → `CONFLICT` «Вы уже откликнулись»);
  **лимит Free** `maxBriefResponsesMonthly` (Free = 10/мес, PRO = null) → `FORBIDDEN`
  «Лимит откликов этого месяца исчерпан (10 из 10). PRO снимает лимит» + `details: {used, max, resetsAt}`;
  телефон верифицирован. `message` — контакт-детект (§4): дезинтермедиация до заявки, общение — в чате.
  Клиенту — `Notification(BRIEF_RESPONSE)`.
- **Права**: specialist. **Аналитика**: `brief_response_sent {briefId, hasPrice}`.

### briefs.responses — query (сравнение профилей рядом)
- **Вход**: `{ briefId, cursor?, limit? }`
- **Выход**: `{ items: [{response, specialist: SpecialistCard + ReviewAggregate-снимок /* подшкалы для сравнения */}], nextCursor }`
- **Права**: owner брифа. **Аналитика**: `brief_responses_viewed {count}`.

### briefs.decideResponse — mutation
- **Вход**: `{ responseId, action: 'SHORTLIST' | 'DECLINE' | 'ACCEPT' }`
- **Выход**: `{ response, thread?: {id} }`. `ACCEPT` → создаёт/находит `ChatThread(briefId)` со сторонами,
  `Notification(BRIEF_RESPONSE_ACCEPTED)`; дальше — чат и `orders.create` из треда.
- **Права**: owner брифа. **Аналитика**: `brief_response_decided {action}`.

### briefs.myResponses — query
- `{ status?, cursor? }` → отклики специалиста со статусами. **Права**: specialist.

---

## 12. Модуль `chat`

REST/tRPC — история и отправка (надёжность, идемпотентность); WS (§17) — реалтайм-доставка.
Контент чата НЕ санитизируется (решение 03/7).

### chat.start — mutation («прямая заявка в 2 клика»)
- **Вход**: `{ specialistUserId, context?: { caseId? | briefId? }, firstMessage: string(1..2000) }`
- **Выход**: `{ threadId, message }`. Существует тред пары (+briefId) → возвращается он же (идемпотентно).
- **Права**: client, specialist; guest → `auth_required` (главный момент регистрации клиента).
  Специалист с `acceptsOrders: false` → `PRECONDITION_FAILED` «Специалист сейчас не принимает заказы».
- **Аналитика**: `chat_thread_created {source: case|profile|brief}` — старт воронки заявки.

### chat.threads — query
- `{ cursor?, limit? }` → `{ items: [{threadId, peer: карточка, lastMessage: превью, unreadCount, order?: {id, state}, brief?: {id, title}}], nextCursor }` — сортировка `lastMessageAt DESC`. **Права**: participant.

### chat.messages — query
- `{ threadId, cursor?, limit? (default 30) }` → `{ items: Message[], nextCursor }` — keyset назад во времени
  (`createdAt DESC` отдаём, рендер реверсом). `Message = { id, senderId, kind: 'TEXT'|'IMAGE'|'FILE', text?, file?: {url /* короткоживущий signed GET */, name, size, mime, blurhash?}, createdAt, deliveredAt?, readAt? }`
- **Права**: participant; прочим `NOT_FOUND`.

### chat.send — mutation
- **Вход**: `{ threadId, kind: 'TEXT' | 'IMAGE' | 'FILE', text?: string(1..4000), uploadId? /* для IMAGE/FILE через §8; PDF/док до 25 МБ */, idempotencyKey /* обязателен: офлайн-ретраи мобильного клиента */ }`
- **Выход**: `{ message }`. Побочно: `lastMessageAt`, WS `message.new` собеседнику, оффлайн-собеседнику
  (нет WS ≥60 с) — `Notification(NEW_MESSAGE)` → Telegram/push.
- **Права**: participant. **Rate limit**: §3. **Ошибки**: «Сообщение пустое»; «Файл ещё загружается».
- **Аналитика**: `message_sent {kind, hasOrder}`.

### chat.markRead — mutation
- `{ threadId, upToMessageId }` → `{ unreadCount: 0 }`. Обновляет `lastReadAt`, WS `thread.read` собеседнику. **Права**: participant.

---

## 13. Модуль `orders`

State machine — `data-model-notes.md §1`. Все переходы — через две процедуры с матрицей прав.
Никаких платёжных операций: `agreedAmount` — информационное поле.

### orders.create — mutation
- **Вход**: `{ threadId /* заказ рождается из чата */, title: string(5..120), description?: string(..3000), agreedAmount?: int≥0, idempotencyKey? }`
- **Выход**: `{ order: {id, state: 'DISCUSSION'} }`. Клиент/специалист определяются ролями в паре треда.
- **Права**: participant треда; телефон инициатора верифицирован (`PRECONDITION_FAILED`
  «Подтвердите телефон — заказы связывают два подтверждённых номера»). Уже есть активный заказ
  (не COMPLETED/CANCELLED) в треде → `CONFLICT` «В этом чате уже есть активный заказ».
- **Аналитика**: `order_created {fromBrief: bool}`.

### orders.confirmAgreement — mutation (DISCUSSION → AGREED)
- **Вход**: `{ orderId, expectedState: 'DISCUSSION' }`
- **Выход**: `{ order }`. Проставляет `clientAgreedAt` ИЛИ `specialistAgreedAt` по роли вызывающего;
  вторым подтверждением — переход в `AGREED` (антифрод: оба `phoneVerifiedAt` обязательны, иначе
  `PRECONDITION_FAILED` «Вторая сторона ещё не подтвердила телефон»).
- **Права**: participant. Повторное подтверждение той же стороной — идемпотентный no-op.
- **Аналитика**: `order_state_changed {from: 'DISCUSSION', to: 'AGREED', by}` (по факту перехода).

### orders.transition — mutation (все остальные переходы)
- **Вход**: `{ orderId, action, expectedState, reason?: string /* обязателен для cancel/dispute/return */, idempotencyKey? }`

  **Матрица допустимых переходов (единственный источник — `packages/core/order`):**

  | action | из → в | КТО может | Побочные эффекты |
  |---|---|---|---|
  | `start_work` | AGREED → IN_PROGRESS | specialist | уведомление клиенту |
  | `deliver` | IN_PROGRESS → DELIVERED | **только specialist** | `deliveredAt`, `autoConfirmAt = +7 дней` (конфиг), `Notification(ORDER_DELIVERED)` клиенту; за сутки до дедлайна воркер шлёт `ORDER_AUTO_CONFIRM_SOON` |
  | `confirm_completion` | DELIVERED → COMPLETED | **только client** (или BullMQ-воркер по `autoConfirmAt`) | `confirmedAt/completedAt`, `ClientProfile.completedOrdersCount++`, пересчёт `ReviewAggregate.completedOrdersCount/repeatClientsPct`, **velocity-проверка пары** → аномалия = `ModerationItem(VELOCITY_ANOMALY)`; открывает право на отзыв |
  | `return_to_work` | DELIVERED → IN_PROGRESS | client (`reason` обязателен) | сброс `deliveredAt/autoConfirmAt`; ≤3 возвратов (core), дальше «Похоже, нужна помощь — откройте спор» |
  | `cancel` | DISCUSSION \| AGREED \| IN_PROGRESS → CANCELLED | обе стороны (`reason` обязателен) | `cancelledAt/ById/Reason`; терминально |
  | `open_dispute` | IN_PROGRESS \| DELIVERED → DISPUTED | обе стороны (`reason` обязателен) | `ModerationItem(ORDER, DISPUTE)` — арбитраж админа (§15 `moderation.decide` закрывает в COMPLETED или CANCELLED) |

- **Выход**: `{ order }`. Каждый переход: `AnalyticsOutbox(order_state_changed {from, to, by, orderId})` +
  `Notification(ORDER_STATE_CHANGED)` второй стороне — в одной транзакции.
- **Ошибки**: недопустимый переход → `PRECONDITION_FAILED` «Из статуса „Сдан“ так нельзя — подтвердите
  приёмку или верните на доработку»; не та роль → `FORBIDDEN` «Сдачу работы предлагает специалист»;
  `expectedState` разошёлся → `PRECONDITION_FAILED` (§2).

### orders.addCheckpoint — mutation
- **Вход**: `{ orderId, title: string(2..120), note?: string(..1000), photoUploadIds: string[](1..10), idempotencyKey? }`
- **Выход**: `{ checkpoint }`. Заказ в `AGREED | IN_PROGRESS | DELIVERED`. Фото — EXIF-стрип (§8).
  Чек-поинты с фото повышают вес будущего отзыва (§14) — UI это прямо говорит специалисту.
- **Права**: participant (обычно specialist). **Аналитика**: `checkpoint_added {photosCount}`.

### orders.list — query
- `{ role?: 'client' | 'specialist', state?: OrderState[], cursor?, limit? }` → `{ items: [{order, peer, checkpointsCount, canReview: bool}], nextCursor }`. **Права**: client, specialist (только свои).

### orders.byId — query
- `{ orderId }` → `{ order, checkpoints[], review?, timeline: [{state, at, by}] }`. **Права**: participant, moderator/admin. Прочим `NOT_FOUND`.

---

## 14. Модуль `reviews`

### reviews.create — mutation
- **Вход**: `{ orderId, scores: { quality: int(1..5), timeline: int(1..5), communication: int(1..5), budget: int(1..5) }, text?: string(..3000), photoUploadIds?: string[](..10), idempotencyKey? }`
- **Выход**: `{ review, aggregate: обновлённый ReviewAggregate }`
- **Инварианты `packages/core/reputation` (одна транзакция)**:
  1. `order.state === 'COMPLETED'` — иначе `PRECONDITION_FAILED` «Отзыв можно оставить после завершения заказа»;
  2. `author === order.clientId` — иначе `FORBIDDEN` «Отзыв оставляет клиент заказа»
     (специалист клиента в MVP не оценивает — решение 00/§2);
  3. один отзыв на заказ (`orderId @unique`) → `CONFLICT` «Отзыв по этому заказу уже есть»;
  4. окно: ≤90 дней после `completedAt` → `PRECONDITION_FAILED` «Срок для отзыва истёк»;
  5. **вес** `weight (0..1)`: base 0.7; +0.15 клиент с `Verification(IDENTITY, APPROVED)`;
     +0.15 у заказа ≥2 чек-поинтов с фото («отзыв с историей работ»); формула — чистая функция с юнит-тестами;
  6. пересчёт `ReviewAggregate` (средневзвешенные по подшкалам, avgOverall, repeatClientsPct) — в этой же транзакции;
  7. velocity-антифрод: ≥3 отзывов той же пары за 90 дней → отзыв публикуется, но `ModerationItem(VELOCITY_ANOMALY)`.
  8. `text` — контакт-детект (§4), публичное поле.
  Импорта внешних отзывов НЕТ (решение 03/5) — процедур под это нет намеренно.
- **Права**: client (сторона заказа). **Аналитика**: `review_created {orderId, weight, hasPhotos, hasText}` — финал воронки.

### reviews.listBySpecialist — query
- **Вход**: `{ specialistSlug, cursor?, limit?, sort?: 'fresh' | 'weight' }`
- **Выход**: `{ items: [{scores, text /* §4 */, photos, weightBadge: 'verified_client' | 'with_checkpoints'[], author: {displayName, avatarUrl}, order: {title, completedAt}, createdAt}], nextCursor, aggregate }`
  — `hiddenAt != null` исключены; у каждого отзыва виден контекст «по заказу N» (честность = позиционирование).
- **Права**: guest+ (SSR, schema.org Review). **Аналитика**: `reviews_viewed {slug}`.

### reviews.myPending — query
- `{}` → `{ items: [{order, autoRemindAt}] }` — завершённые заказы без отзыва (для nudge-уведомлений). **Права**: client.

---

## 15. Модули `moderation` и `admin`

### moderation.queue — query
- **Вход**: `{ status?: ModerationStatus (default PENDING), entityType?: ModerationEntityType, reason?: ModerationReason, assignee?: 'me' | 'unassigned', cursor?, limit? }`
- **Выход**: `{ items: [{item, entityPreview /* снапшот сущности: кейс с фото, отзыв, спор с таймлайном заказа */, reportsCount}], nextCursor, counts: {pending, byReason} }`
- **Права**: moderator, admin. **Аналитика**: `moderation_queue_viewed`.

### moderation.item — query
- `{ itemId }` → полный контекст: сущность, payload (pHash-совпадения со ссылками на оригиналы, метрики
  аномалии, жалобы), история решений по автору, **несанитизированный** оригинал текста. **Права**: moderator, admin.

### moderation.assign — mutation
- `{ itemId, toSelf: boolean }` → `{ item }`. **Права**: moderator, admin.

### moderation.decide — mutation
- **Вход**: `{ itemId, decision: 'APPROVE' | 'REJECT' | 'ESCALATE', resolution?: string, rejectReason?: string /* обязателен при REJECT — уходит автору человеческим языком */ }`
- **Выход**: `{ item }`. **Побочные эффекты по entityType (транзакционно)**:
  - `CASE (NEW_USER_PREMOD/PHASH/REPORTED)`: APPROVE → `PUBLISHED` + индексация + `Notification(CASE_PUBLISHED)`;
    3-й approve подряд у автора → авто-повышение `trustTier NEW → TRUSTED`; REJECT → `REJECTED` + причина.
  - `ORDER (DISPUTE)`: арбитраж — `resolution` обязателен; APPROVE → COMPLETED, REJECT → CANCELLED
    (уведомления обеим сторонам; отзыв возможен только при COMPLETED).
  - `REVIEW`: REJECT → `hiddenAt = now()` + пересчёт `ReviewAggregate`.
  - `VERIFICATION`: APPROVE → бейдж (`Notification(VERIFICATION_RESULT)`); REJECT → причина.
  - `USER/MESSAGE/BRIEF`: скрытие контента / предупреждение / бан (через admin.banUser при эскалации).
  - ESCALATE → админу.
- **Права**: moderator (кроме арбитража споров и банов — admin), admin.
- **Аналитика**: `moderation_decided {entityType, reason, decision, timeToDecideSec}` (SLA премодерации ≤2 ч).

### moderation.report — mutation (жалоба; создаёт вход в очередь)
- **Вход**: `{ targetType: 'CASE'|'REVIEW'|'USER'|'BRIEF'|'MESSAGE'|'COLLECTION', targetId, reason: ReportReason, comment?: string(..500) }`
- **Выход**: `{ ok: true }` (плоско, без раскрытия судьбы). ≥3 открытых жалоб на цель →
  `ModerationItem(REPORTED)`. Повторная жалоба того же на то же — идемпотентный no-op.
- **Права**: client, specialist. **Rate limit** §3. **Аналитика**: `report_created {targetType, reason}`.

### admin.* (роль admin, каждая мутация пишет `admin_action {action, targetId}` в outbox)
- **admin.users** — query: `{ q? /* телефон/имя/slug */, role?, trustTier?, cursor? }` → пользователи + флаги.
- **admin.setTrustTier** — mutation: `{ userId, tier: TrustTier, note }`.
- **admin.banUser / admin.unbanUser** — mutation: `{ userId, reason }` → soft-delete/восстановление;
  сессии гасятся, контент скрывается из публичных выборок.
- **admin.grantEntitlement** — mutation: `{ userId, planCode: 'PRO', durationDays: int(1..365), note }` →
  ручная активация PRO (решение 03/8). **Аналитика**: `entitlement_granted {source: 'MANUAL'}`.
- **admin.createPromoCode** — mutation: `{ code?: string /* или автогенерация */, planCode, durationDays, maxRedemptions, expiresAt? }`.
- **admin.taxonomy** — mutations CRUD `Style/Category/City/District/Tag` (slug, nameRu/Ky/En, sortOrder).
- **admin.createBoost** — mutation: `{ target: {caseId} XOR {specialistProfileId}, startsAt, endsAt, priceSom: int }`
  — буст продаётся вручную до платёжек; XOR валидируется core. **Аналитика**: `boost_created`.
- **admin.stats** — query: `{ period }` → доменный дашборд: DAU/WAU, воронка клиент→заявка→заказ→отзыв,
  retention-когорты, очередь модерации (тонкий слой поверх PostHog + свои счётчики).

---

## 16. REST route handlers (вне tRPC)

| Маршрут | Метод | Назначение |
|---|---|---|
| `/api/webhooks/telegram` | POST | апдейты бота (grammY): `/start <token>` → привязка `telegramChatId`; ответные команды. Защита: `X-Telegram-Bot-Api-Secret-Token` (сравнение с env), иначе 403. Ответ всегда 200 (ретраи TG) |
| `/api/webhooks/payments/{provider}` | POST | заглушка за абстракцией `PaymentProvider` (Mbank/O!Деньги/Элсом/Balance.kg — после мерчант-договоров). Проверка подписи провайдера; идемпотентность по `externalPaymentId`; успех → `Entitlement(source: PAYMENT)`. До договоров возвращает 404 |
| `/api/og/case/{slug}` | GET | OG-изображение кейса 1200×630 (satori/resvg): обложка + заголовок + автор + бейджи. Кэш: CDN, `s-maxage=86400`, инвалидация по `updatedAt`. Виральность WhatsApp/Telegram |
| `/api/og/profile/{slug}` | GET | OG-карточка профиля: обложка, имя, специализация, рейтинг, город |
| `/api/auth/google` | GET | redirect на Google OAuth (state в cookie) |
| `/api/auth/google/callback` | GET | обмен кода, создание/линк пользователя, установка сессии, redirect (`?returnTo=`, только относительные пути) |
| `/api/health` | GET | liveness для Docker/monitoring |

Sitemap/robots — штатные механизмы Next.js (`app/sitemap.ts`), не часть контракта API.

## 17. WebSocket (`apps/services`, `wss://…/ws`)

- **Подключение**: та же session-cookie (общий Redis-стор сессий с apps/web); невалидна →
  close `4401`. Heartbeat ping/pong 30 с. Реконнект — экспоненциальный, после реконнекта клиент
  докачивает пропущенное через `chat.messages` / `notifications.list` (WS — только доставка,
  истина — Postgres).
- **Подписки**: сервер сам подписывает сокет на треды пользователя и его каналы уведомлений.

Клиент → сервер:

| Событие | Payload | Примечание |
|---|---|---|
| `typing.start` / `typing.stop` | `{ threadId }` | throttle 3 с на клиенте; не персистится |
| `presence.ping` | `{}` | обновляет `lastSeenAt` (батч) |

Сервер → клиент:

| Событие | Payload | Когда |
|---|---|---|
| `message.new` | `{ threadId, message }` | `chat.send` второй стороны |
| `message.delivered` | `{ threadId, messageId, deliveredAt }` | сокет получателя подтвердил приём (ack) |
| `thread.read` | `{ threadId, upToMessageId, readAt }` | собеседник вызвал `chat.markRead` |
| `typing` | `{ threadId, userId, isTyping }` | ретрансляция участникам |
| `notification.new` | `{ notification }` | любое `Notification` — живой бейдж центра уведомлений |
| `upload.processed` | `{ uploadId, imageId, status: 'READY' \| 'FAILED' }` | воркер обработал изображение (§8) |
| `order.updated` | `{ orderId, state }` | переход state machine — живой статус в открытом чате |

## 18. Модуль `billing` (entitlements, промокоды; платёжек в MVP нет)

### billing.plans — query
- `{}` → `{ plans: [{code: 'FREE'|'PRO', name, priceMonthly /* сомы + usd */, limits: {maxPublishedCases, maxBriefResponsesMonthly}, features: {hasAnalytics, hasPriorityFeed, hasShowcaseMode}}] }`. **Права**: guest+ (страница тарифов).

### billing.myEntitlements — query
- `{}` → `{ plan: {code, expiresAt, source}, usage: { publishedCases: {used, max: int | null}, briefResponses: {used, max, resetsAt} } }`
  — единственный источник истины для UI лимитов («3 из 5 кейсов»). **Права**: client, specialist.

### billing.redeemPromo — mutation
- **Вход**: `{ code: string(4..32), idempotencyKey? }`
- **Выход**: `{ entitlement: {plan: 'PRO', expiresAt}, message: 'PRO активирован до 5 августа' }`
- **Проверки (транзакция с блокировкой строки кода)**: код активен и не истёк → `NOT_FOUND`
  «Такого промокода нет или он истёк»; `redeemedCount < maxRedemptions` → `CONFLICT` «Код уже использован»;
  повторное применение тем же пользователем → `CONFLICT` «Вы уже активировали этот код».
  Активный PRO → продление (`expiresAt += durationDays`).
- **Права**: client, specialist. **Rate limit**: 10/час (перебор кодов). **Аналитика**: `promo_redeemed {plan, durationDays}`.

Проверка лимитов НЕ дублируется по модулям: `core/entitlements.check(userId, 'publish_case' | 'brief_response')`
вызывается из `cases.submit` и `briefs.respond` в их транзакциях.

## 19. Модуль `notifications`

In-app центр — источник истины; Telegram и PWA push — каналы доставки (матрица 00/§2).

### notifications.list — query
- `{ onlyUnread?: boolean, cursor?, limit? }` → `{ items: [{id, type, title, body, payload /* deep-link: {caseId|orderId|threadId|url} */, readAt, createdAt}], nextCursor, unreadCount }`. **Права**: client, specialist.

### notifications.markRead — mutation
- `{ ids: string[] } | { all: true }` → `{ unreadCount }`. Идемпотентно. **Аналитика**: `notification_read {type}` (по deep-link-клику — отдельно `notification_opened`).

### notifications.unreadCount — query
- `{}` → `{ notifications: int, messages: int }` — бейджи (poll-fallback при отсутствии WS).

### notifications.getPrefs / notifications.updatePrefs — query / mutation
- **Модель**: матрица `NotificationType-группа × канал` →
  `{ prefs: { orders: {inApp: true /* всегда, не отключается */, telegram: bool, push: bool}, messages: {...}, social /* лайки, сохранения, подписчики */: {...}, briefs: {...}, system: {...} } }`
- `updatePrefs` принимает частичный патч той же формы. Критичные для антифрода уведомления
  (`ORDER_AUTO_CONFIRM_SOON`) игнорируют opt-out Telegram при привязанном боте — авто-подтверждение
  без предупреждения недопустимо. **Права**: owner. **Аналитика**: `notification_prefs_updated`.

### notifications.subscribePush — mutation
- `{ subscription: {endpoint, keys: {p256dh, auth}} }` → `{ ok }` — PWA Web Push (VAPID); iOS — только
  после установки на домашний экран, поэтому первичен Telegram. Идемпотентно по endpoint.

---

## 20. Сводка аналитических событий воронки (сквозная)

`feed_viewed → case_opened → case_saved / profile_viewed → chat_thread_created → order_created →
order_state_changed(COMPLETED) → review_created` — обязательные свойства: `source`, роль актора,
`anonId → userId` алиасинг при регистрации (PostHog identify). Схема событий — `packages/core/analytics`
(типизированный реестр: имя → zod-схема props; писать событие мимо реестра нельзя).

## 21. Открытые вопросы к ревью

1. Окно отзыва 90 дней и base-вес 0.7 — цифры-дефолты, вынесены в конфиг `core/reputation`.
2. `briefs.listOpen` только специалистам — сознательное сужение (защита клиентов от скрейпинга лидов); альтернатива — публичная лента брифов без контактов.
3. Лимит откликов Free = 10/мес — дефолт, продукт не зафиксировал число (`Plan.maxBriefResponsesMonthly` seed).
4. `message.delivered` требует ack-протокола на клиенте — если дорого для M4, режем до `thread.read` (двойные галочки — nice-to-have).
