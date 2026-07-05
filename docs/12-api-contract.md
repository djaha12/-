# ATELIER — контракт API MVP (финал)

Статус: **финал M1** (заменяет `docs/drafts/api-contract.md`). Источники: `docs/04-product-spec.md`
(истина), `docs/03-decisions.md`, `docs/00-prompt-analysis.md`, `docs/drafts/schema.prisma` +
`data-model-notes.md`. Внесены blocker/major-правки ревью (`review-backend.md`, `review-qa.md`,
`review-ux.md`) — сводка правок в §22. Все доменные правила живут в `packages/core` и вызываются
из процедур в одной транзакции с записью.

Парный документ: `docs/13-events-notifications.md` — **единственный** реестр имён аналитических
событий и типов уведомлений. Все имена событий в этом контракте — канонические имена реестра.

## 0. Транспорт и общие конвенции

- **tRPC** (роутеры в `apps/web`, `/api/trpc`), superjson, интеграция с TanStack Query.
  Типы край-в-край; будущий React Native использует те же роутеры.
- **Чистые REST route handlers** — только вебхуки (Telegram, платёжки), OG-изображения,
  Google OAuth redirect-flow (§16).
- **WebSocket** — `apps/services` (Fastify), события чата и уведомлений (§17).
- **Сессии**: httpOnly-cookie (`atelier_session`, SameSite=Lax, 90 дней, sliding). Контекст tRPC:
  `{ user | null, entitlement, trustTier, anonId }`. `anonId` — cookie гостя для аналитики,
  view-дедупликации и гостевых жалоб.
- **Роли в колонке «права»**: `guest` (без сессии), `client`, `specialist`, `owner` (владелец
  конкретного ресурса), `participant` (сторона заказа/треда), `moderator`, `admin`. `admin ⊇ moderator`.
  Гость видит ленту/кейсы/профили/поиск без регистрации; мутации ценности (save, заявка) возвращают
  `UNAUTHORIZED` с `reason: "auth_required"` — фронт открывает регистрацию «в момент ценности».
- **Заморозка аккаунта** (санкция модерации, §15): `User.frozenAt != null` → все мутации создания
  ценности (кейсы, отклики, заявки/чаты с новыми адресатами, заказы, отзывы) → `FORBIDDEN`
  «Аккаунт временно заморожен — подробности в уведомлениях». Чтение и профиль остаются доступными
  (в отличие от бана: там профиль скрыт).
- **Ошибки**: tRPC-коды (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `PRECONDITION_FAILED`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`) + shape
  `{ code, messageKey, message, details? }`. `message` — человеческий русский текст
  («Код не подошёл. Осталось 2 попытки», не «OTP_INVALID»); `messageKey` — ключ i18n для ky/en.
- **Деньги**: всегда целые сомы (Int, KGS). USD — только отображение, курс отдаёт `feed.meta`/`profiles.publicBySlug`.
- **Аналитика**: каждая значимая процедура пишет событие в `AnalyticsOutbox` в той же транзакции
  (transactional outbox → воркер → PostHog). Имена — только из реестра
  `packages/core/analytics/events.ts` (канон — `13-events-notifications.md`, Часть А);
  строковых литералов имён в коде нет.
- **Audit log**: каждая модераторская/админская мутация и просмотр документов верификации пишут
  строку в append-only `AuditLog(actorId, action, entityType, entityId, payload, createdAt)` —
  в транзакции с действием. Это отдельно от `AnalyticsOutbox` (тот — доставка в PostHog, не журнал).
- **Запрещено навсегда**: кредитные/процентные механики. В API нет и не будет процедур escrow,
  комиссий, рассрочек; `agreedAmountMin/Max` — информационные поля.
- **Канонический маршрут кейса**: `/c/{slug}` (SSR) — единый для UX-драфтов, deep-links и OG.

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

## 2. Идемпотентность и конкурентность

- Создающие мутации принимают опциональный `idempotencyKey: string (uuid v4)`:
  `orders.create`, `orders.transition`, `reviews.create`, `cases.submit`, `chat.send` (обязателен),
  `briefs.respond`, `billing.redeemPromo`, `orders.addCheckpoint`, `collections.importGuestSaves`.
- Механика: Redis `SETNX idem:{userId}:{key}` → по завершении сохраняем `{inputHash, response}` (TTL 24 ч).
  Повтор с тем же ключом и тем же входом → сохранённый ответ (без побочных эффектов);
  тот же ключ + другой вход → `CONFLICT` «Похоже, запрос отправился дважды с разными данными».
- Естественная идемпотентность через unique-констрейнты БД (повтор → текущее состояние, не ошибка):
  like/save (`@@unique(userId, caseId)`), отклик на бриф (`@@unique(briefId, specialistId)`),
  отзыв (`Review.orderId @unique`), follow, membership.
- **Optimistic concurrency**:
  - переходы заказа — поле `expectedState`: состояние изменилось между чтением и кликом →
    `PRECONDITION_FAILED` «Заказ уже в другом статусе — обновите страницу»;
  - **черновик кейса** — `cases.update/reorderImages/removeImage` принимают `baseUpdatedAt`
    (значение `Case.updatedAt`, которое клиент видел): расхождение → `PRECONDITION_FAILED`
    «Черновик обновлён на другом устройстве» + `details.current` (свежая версия) — UI предлагает
    выбор. Обещание «черновик не теряется никогда» иначе ломается парой телефон+ноутбук.
- **Advisory lock на лимитах**: `cases.submit` и `briefs.respond` берут
  `pg_advisory_xact_lock(hashtext(userId))` вокруг `count + insert/update` — `READ COMMITTED`
  сам по себе допускает двойную публикацию при конкурентных сабмитах.

## 3. Rate limits

Redis sliding window, ключи по `userId` (авторизован) или `IP+anonId` (гость).
Превышение → `TOO_MANY_REQUESTS` + `retryAfterSec`; текст человеческий («Слишком часто. Попробуйте через минуту»).

| Область | Лимит |
|---|---|
| `auth.requestOtp` | 1/мин и 5/час на телефон; 10/сутки на IP; повторный запрос до `retryAfterSec` → та же ошибка |
| `auth.verifyOtp` | 5 попыток на challenge, затем challenge аннулируется; **дополнительно 20/час на IP** (распределённый перебор); 3 подряд аннулированных challenge на номер → кулдаун 1 час |
| `auth.changePhone` | 2/сутки на пользователя |
| `chat.send` | 30/мин на пользователя; 5 первых сообщений/час новым (`trustTier=NEW`) незнакомым адресатам — антиспам |
| `chat.start` | 10 новых тредов/сутки для `trustTier=NEW` (заодно ограничивает фарм раскрытых телефонов) |
| `briefs.respond` | 20/сутки поверх лимита плана |
| `reviews.create` | 5/сутки на пользователя (velocity поверх — §14) |
| `cases.*` мутации | 60/мин; `requestImageUpload` 30/мин, 200/сутки |
| `moderation.report` | 20/сутки на пользователя; для гостя — 10/сутки на IP+anonId |
| `search.query` | 60/мин гость, 120/мин авторизованный |
| `feed.trackView` | батчи, максимум 1 view на (case, anonId/userId) в сутки |
| `billing.redeemPromo` | 10/час (перебор кодов) |
| Глобально guest read | 300/мин на IP (защита от скрейпинга портфолио) |
| Мутации по умолчанию | 120/мин на пользователя |

## 4. Автоскрытие контактов в публичном контенте

Решение 03/7: телефоны/мессенджеры/ссылки скрываются в **публичном** контенте, в чате — свободно.

- Детектор `core/contacts.detect()`: телефоны (в т.ч. `0(555)-12-34-56`, `+996…`, «ноль пятьсот…»),
  `@username`, ссылки t.me/wa.me/instagram, e-mail, обфускации («тел в профиле инсты»).
- **Применение на чтение**: публичные выборки прогоняют поля через `core/contacts.hide()` →
  замена на `[контакт скрыт — напишите в чат]`. Оригинал в БД не портится (модератору виден).
  **Включая REST OG-роуты §16** — они читают кейс/профиль мимо tRPC-процедур, санитизация обязана
  жить в shared-слое чтения, не в процедурах.
- **Применение на запись**: детект при создании/обновлении → предупреждение в UI
  (`warnings: ["contacts_hidden"]` в ответе мутации); ≥3 срабатываний за 7 дней →
  `ModerationItem(CONTACT_LEAK)`.
- Санитизируемые поля: `Case.title/description`, `CaseImage.caption`, **`CaseImageAnnotation.text`**
  (метки на фото — §8), `Brief.title/description`, `BriefResponse.message`, `Review.text`,
  **`Review.replyText`**, `SpecialistProfile.headline/bio`, названия коллекций, `Organization.about`.
- НЕ санитизируются: `Message.text` (чат свободен), контент заказа между сторонами, поля для владельца.
- **Раскрытие телефона** — единственное легитимное исключение из «скрыто»: телефон второй стороны
  виден участникам треда-заявки (§12) — спека: «телефон скрыт ДО заявки».

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
- **N+1-защита**: обложка карточки — денормализованное `Case.coverImageId` (+ cover-поля), не
  `include {images: take 1}`; то же поле использует OG-генератор (§16).
- **Буст**: максимум 1 кейс из активных `BoostCampaign` на каждые 12 позиций, всегда `promoted: true`
  (в UI — пометка «продвижение»). Инкремент `impressionsCount` — батчем.
- **Ошибки**: некорректные фильтры → `BAD_REQUEST` («Неизвестный город»).
- **Аналитика**: `feed_viewed {source, filters_active}`, `boost_impression {campaign_id}`.

### feed.meta — query
- **Вход**: `{}` → **Выход**: `{ cities, styles, categories, specializations, usdRate: {rate, rateDate} }` — справочники фильтров + курс НБКР (кэш сутки). **Права**: guest+.

### feed.trackView — mutation
- **Вход**: `{ caseId }` → **Выход**: `{ ok: true }`. Дедуп в Redis (сутки), инкремент `viewsCount` батчем.
- **Права**: guest+ (по anonId). **Аналитика**: события НЕТ намеренно (реестр А.0 п.10 —
  «просмотр карточки не логируем»); это только счётчик БД. Открытие страницы кейса логирует
  клиент (`case_opened`).

---

## 6. Модуль `auth`

Модель идентичности (правка blocker review-backend №1): `User.phone` — **nullable** `@unique`;
Google-идентичность живёт в `AuthIdentity(provider, providerId, userId)` (+ `User.email String? @unique`).
Инвариант входа: у пользователя есть телефон ИЛИ ≥1 AuthIdentity. Действия ценности (отклик, заявка,
бриф, заказ) требуют `phoneVerifiedAt` — проверяется в соответствующих процедурах.

### auth.requestOtp — mutation
- **Вход**: `{ phone: string /* E.164, +996… */, mode?: 'login' | 'link' | 'change' }`
- **Выход**: `{ challengeId, channel: 'telegram' | 'sms', retryAfterSec: 60, codeLength: 6 }`
  Канал выбирает `OtpChannel`-абстракция (решение 03/2): Telegram Gateway первичный, SMS fallback, mock в dev.
- **Хранилище challenge**: Redis `otp:{challengeId}`, **TTL 10 мин**, счётчик попыток атомарно
  (INCR); хранится только хэш кода. Таблица в Postgres не нужна.
- **Права**: guest+ (`link`/`change` — только авторизованный). **Rate limit**: §3 — самый строгий в системе.
- **Ошибки**: `BAD_REQUEST` «Проверьте номер — формат +996 XXX XXX XXX»; `TOO_MANY_REQUESTS`
  «Код уже отправлен. Повторно — через 60 секунд». Существование аккаунта НЕ раскрывается.
- **Аналитика**: `auth_otp_requested {channel, attempt}`.

### auth.verifyOtp — mutation
- **Вход**: `{ challengeId, code: string(6), profile?: { displayName: string(2..50), role: 'CLIENT' | 'SPECIALIST' } /* только для новых */ }`
- **Выход**: `{ user: SessionUser, isNewUser: boolean, needsOnboarding: boolean }` + установка session-cookie.
  Новый пользователь без `profile` → `{ isNewUser: true, needsProfile: true }` (двухшаговая
  регистрация; `displayName` в схеме nullable — заявка клиента может уйти до ввода имени,
  правка review-ux №20). Специалисту создаётся **пустой** `SpecialistProfile` (slug из транслита
  имени; `specialization` и `cityId` в схеме nullable — правка blocker review-backend №2);
  видимость в ленте/поиске — core-правило «профиль публичен только при заполненных
  specialization + city», онбординг ведёт мастер.
- **Права**: guest. **Ошибки**: «Код не подошёл. Осталось N попыток»; «Код устарел — запросите новый»
  (`PRECONDITION_FAILED`); после 5 попыток challenge гасится.
- **Аналитика**: `auth_otp_verified {channel, attempts, time_to_verify_sec}`,
  `auth_completed [S] {anon_id, role, trigger, is_new_user}` — точка identify/alias.

### auth.session — query
- **Вход**: `{}` → **Выход**: `{ user: SessionUser | null }`,
  `SessionUser = { id, role, displayName, avatarUrl, phoneVerified, trustTier, frozen: boolean, locale, telegramLinked, plan: {code, limits}, unreadNotifications, unreadMessages }`. **Права**: guest+.

### auth.logout — mutation
- `{}` → `{ ok }`; гасит сессию. **Права**: любой авторизованный.

### auth.linkTelegram — mutation
- **Вход**: `{}` → **Выход**: `{ deepLink: "https://t.me/<bot>?start=<oneTimeToken>", expiresInSec: 600 }`.
  Токен одноразовый; бот по `/start token` привязывает `telegramChatId` (вебхук §16) и шлёт приветствие.
  First-class шаг онбординга (риск 00/1.8 — iOS push). **Права**: client, specialist.
- **Аналитика**: `telegram_link_started {source}`, `telegram_link_completed [S]` (из вебхука).

### auth.linkPhone — mutation
- Привязка телефона к аккаунту без него (Google-вход): flow `requestOtp(mode:'link')` → `verifyOtp`.
  Телефон занят другим аккаунтом → `CONFLICT` «Этот номер уже привязан к другому аккаунту —
  войдите через него». **Права**: авторизованный без `phoneVerifiedAt`.

### auth.changePhone — mutation (правка review-qa №6)
- **Флоу**: из активной сессии `requestOtp(mode:'change', phone: новый)` → `verifyOtp` со старой сессией.
- **Эффекты**: телефон меняется; на **старые** каналы (Telegram, in-app) уходит
  `Notification(account_security)` с кнопкой отката; окно отката 72 ч (страховка от угона);
  запись в `AuditLog`. Новый номер занят → `CONFLICT`.
- **Переизданные номера** (осознанный риск, фиксация): при OTP-входе в аккаунт с `lastSeenAt`
  старше 6 месяцев и привязанным Telegram — дополнительное подтверждение через Telegram-бота;
  без Telegram — вход разрешён (ограничение рынка, риск принят).
- **Права**: client, specialist. **Аналитика**: `phone_changed [S]`.

### Google OAuth
Redirect-flow — REST (§16): `GET /api/auth/google` → consent → `GET /api/auth/google/callback` →
сессия + cookie. Google-аккаунт создаётся с `phone = null, phoneVerifiedAt = null`
(запись в `AuthIdentity('google', sub)`): смотреть/сохранять можно, а отклики, заявки и заказы
требуют телефона — UI ведёт на `auth.linkPhone` в момент ценности.

---

## 7. Модуль `profiles`

### profiles.my — query
- `{}` → полный собственный профиль: `{ user, specialistProfile? | clientProfile?, orgMembership?: {org: {id, name, slug}, status: 'DECLARED'|'CONFIRMED'|'LEFT'|'REJECTED'}, verifications: [{kind, status}], counters }`. **Права**: client, specialist.

### profiles.update — mutation
- **Вход** (specialist): `{ displayName?, avatarUploadId?, headline?: string(..120), bio?: string(..2000), specialization?, cityId?, districtId?, styleIds?: string[](..8), priceMin?: int≥0, priceMax?: int≥priceMin, priceUnit?: 'PER_M2'|'PER_PROJECT'|'PER_HOUR', acceptsOrders?: boolean, coverUploadId?, locale?, org?: { organizationId: string } | { newOrg: { name: string(2..80), cityId } } | null /* метка «работает в X» */ }`;
  клиенту доступны только `displayName, avatarUploadId, cityId, locale`.
- **Организация** (правка review-backend №11): free-text больше нет — выбор из автокомплита
  `orgs.search` (дедуп) или создание новой `Organization` (unverified) + `OrgMembership(DECLARED)`.
  Метка «работает в X» видна сразу с тултипом «указано специалистом, не проверено»;
  `org: null` → membership переводится в `LEFT` (история сохраняется, строка не удаляется).
- **Выход**: обновлённый профиль + `warnings?: ["contacts_hidden"]` (детект контактов в bio/headline — §4).
- **Права**: owner. **Ошибки**: `BAD_REQUEST` «Максимальная цена меньше минимальной»; slug занят → `CONFLICT`.
- **Аналитика**: `profile_updated {fields}`, `accepting_orders_toggled {enabled}`,
  `profile_price_range_set {min_som, max_som, unit}`.

### profiles.publicBySlug — query
- **Вход**: `{ slug }` → **Выход**: `{ profile: { slug, displayName, avatarUrl, coverUrl, specialization, headline, bio /* контакты скрыты §4 */, city, district, styles, priceRange: {min, max, unit, usd: {min,max}}, acceptsOrders, badges: {identityVerified, businessVerified}, worksAt?: {orgSlug, orgName, membershipStatus} }, reputation: ReviewAggregate-снимок { avgOverall, reviewsCount, подшкалы, completedOrdersCount, repeatClientsPct }, cases: первая страница published-кейсов, viewerState: {following} | null }`
  SSR-страница `/{slug}` (SEO, schema.org Person/LocalBusiness) читает эту же процедуру.
- **Права**: guest+. Телефона в **публичном** ответе НЕТ ни при каких условиях — раскрытие
  только участникам треда-заявки (§12).
- **Ошибки**: `NOT_FOUND` «Такого профиля нет или он скрыт».
- **Аналитика**: `profile_viewed {specialist_id, source, is_accepting_orders}` (+ инкремент `viewsCount` батчем).

### profiles.stats — query
- **Вход**: `{ period: '7d' | '30d' | '90d' }` → **Выход**: `{ views: {profile, cases, series[]}, saves, likes, requestsStarted /* открытые заявки-чаты */, conversion: {viewToRequestPct}, topCases: [{caseId, title, views, saves}] }`.
  Free — сводка за 7 дней; полнота и период — по `hasAnalytics` плана (PRO), иначе `FORBIDDEN`
  «Расширенная аналитика доступна на PRO».
- **Права**: owner (specialist). **Аналитика**: `stats_dashboard_opened {period}`.

### profiles.follow / profiles.unfollow — mutation
- `{ userId }` → `{ following: boolean, followersCount }`. Идемпотентно (unique). Нельзя подписаться на себя → `BAD_REQUEST`. **Права**: client, specialist. **Аналитика**: `specialist_followed` / `specialist_unfollowed`.

### profiles.requestVerification — mutation
- **Вход**: `{ kind: 'IDENTITY' | 'BUSINESS', documentUploadIds: string[](1..5) }`.
- **Документы** (правка review-backend №28): scope `verification` в §8 **минует общий пайплайн
  изображений** — приватный бакет, никаких вариантов/CDN/pHash/blurhash; доступ — короткоживущий
  signed GET только модератору, каждый просмотр — в `AuditLog`. Автоудаление: воркер чистит
  объекты в R2 через 30 дней после решения (`Verification.docsPurgedAt`), остаётся `documentLast4`.
- **Выход**: `{ verificationId, status: 'PENDING' }`. Создаёт `ModerationItem(VERIFICATION)`.
- **Права**: specialist. Повторная заявка при PENDING → `CONFLICT` «Заявка уже на проверке».
- **Аналитика**: `verification_submitted {kind}`; результат — `verification_result [S]` из §15.

### profiles.deleteAccount — mutation (правка review-qa №7)
- **Вход**: `{ confirm: true }` → **Выход**: `{ scheduledPurgeAt }` (окно отмены 7 дней — повторный
  вход в течение окна предлагает отменить удаление).
- **Блокировка**: заказы в `AGREED | IN_PROGRESS | DELIVERED | DISPUTED` → `PRECONDITION_FAILED`
  «Сначала завершите или отмените активные заказы».
- **Эффекты по истечении окна** (core-правило, воркер): soft-delete + анонимизация PII —
  `displayName → «Удалённый пользователь»`, avatar/phone очищаются (phone — в хэш для антифрода,
  unique освобождается), сессии гасятся. Отзывы и завершённые заказы **остаются** (репутация
  специалистов неприкосновенна); кейсы автора скрываются; ACCEPTED-коллаборации остаются в чужих
  кейсах как «участник удалил аккаунт».
- **Права**: owner. **Аналитика**: `account_delete_requested`, `account_deleted [S]`.

---

## 7A. Модуль `orgs` (правка review-backend №11; UI MVP — метка + заглушка, решение 03/6)

### orgs.search — query
- `{ q: string(1..80) }` → `{ items: [{id, name, slug, cityName, membersCount, isVerified}] (≤10) }` —
  автокомплит для `profiles.update.org` (дедуп организаций). **Права**: specialist.

### orgs.publicBySlug — query
- `{ slug }` → страница-заглушка `/org/{slug}`: `{ org: {name, slug, city, about /* §4 */, isVerified}, members: [{профиль-карточка, membershipStatus}] /* CONFIRMED + DECLARED с пометкой */, casesPreview: FeedCard[], aggregates: {casesCount, avgOverall} }`. **Права**: guest+.

### orgs.claim — mutation (флоу «это моё агентство»)
- **Вход**: `{ orgId, position: string(2..80), documentUploadIds: string[](1..5) }`
- **Выход**: `{ verificationId, status: 'PENDING' }` → `Verification(kind: ORG_CLAIM, organizationId)`
  + `ModerationItem(VERIFICATION)`, SLA 48 ч. APPROVE (§15) → `OrgMembership(role: OWNER, CONFIRMED)`,
  `Organization.isVerified = true`. **Права**: specialist. **Аналитика**: `verification_submitted {kind: 'org_claim'}`.

### orgs.reviewMembership — mutation
- `{ membershipId, action: 'CONFIRM' | 'REJECT' }` → `{ membership }` — owner организации
  подтверждает/отклоняет заявленные membership'ы (`DECLARED → CONFIRMED | REJECTED`).
  **Права**: owner организации. Уведомление специалисту.

---

## 8. Модуль `cases`

Флоу: `createDraft → update (автосейв) → requestImageUpload → PUT в R2 → attachImage → … → submit`.

### cases.createDraft — mutation
- **Вход**: `{}` (пустой черновик — мастер «кейс за 5 минут» стартует мгновенно)
- **Выход**: `{ caseId, slug }`. **Права**: specialist. Черновики не лимитируются (лимит Free — на published).
- **Аналитика**: клиентское `case_create_started {entry_point, is_first_case}` (серверного события нет).

### cases.update — mutation (автосохранение, debounce 2 с на клиенте)
- **Вход**: `{ caseId, baseUpdatedAt /* §2, optimistic concurrency */, patch: { title?: string(..120), description?: string(..5000), categoryId?, cityId?, districtId?, areaM2?: number(0..100000), budgetMin?: int, budgetMax?: int, timelineDays?: int(1..3650), authorRole?: CaseAuthorRole, styleIds?: string[](..5), tags?: string[](..10), hasPublishRights?: boolean } }`
- **Выход**: `{ case, savedAt, warnings? }`. Патч частичный; контакт-детект → warning (§4).
- **Права**: owner; статус `DRAFT | REJECTED` (published правится через `unpublish`). Иначе `PRECONDITION_FAILED` «Опубликованный кейс сначала снимите с публикации».
- **Аналитика**: — (шумно; клиент троттлит `case_draft_autosaved` 1/60 c сам).

### cases.requestImageUpload — mutation (presigned URL)
- **Вход**: `{ caseId?: string /* или scope: 'avatar'|'cover'|'chat'|'review'|'checkpoint'|'verification' */, contentType: 'image/jpeg'|'image/png'|'image/webp'|'image/heic', sizeBytes: int(..25MB) }`
- **Выход**: `{ uploadId, uploadUrl /* presigned PUT R2, TTL 10 мин */, storageKey }`
- Клиент делает `PUT uploadUrl` напрямую в R2 (мимо приложения), затем подтверждает attach'ем.
  Scope `verification` — отдельный приватный бакет и НИКАКОЙ обработки (§7).
- **Права**: owner scope. **Ошибки**: «Файл слишком большой — до 25 МБ»; «Формат не поддерживается».

### cases.attachImage — mutation
- **Вход**: `{ caseId, uploadId, caption?: string(..300), isBeforeImage?: boolean, beforeAfterGroup?: string, sortOrder?: int }`
- **Выход**: `{ image: { id, status: 'PROCESSING' } }`. Ставит BullMQ-задачу: sharp → **EXIF/GPS-стрип**
  (приватность — обязательное требование), варианты 400/800/1600 AVIF+WebP, blurhash, pHash.
  Готовность — poll `cases.byId` или WS `upload.processed`. pHash-совпадение с чужим published-кейсом
  → изображение помечается, создаётся `ModerationItem(PHASH_DUPLICATE)` (публикацию не блокирует —
  решает модератор; пары, помеченные модератором «не дубликат», повторно не алертятся).
- **Права**: owner. Лимит **20** изображений на кейс (канон; конфиг core) → `BAD_REQUEST` «В кейсе до 20 фото».

### cases.updateImage / cases.removeImage / cases.reorderImages — mutation
- `{ imageId, patch: {caption?, isBeforeImage?, beforeAfterGroup?} }` / `{ imageId, baseUpdatedAt }` / `{ caseId, imageIds: string[], baseUpdatedAt }`.
  Инвариант пары «до/после»: в группе ровно одна `isBeforeImage=true` и одна `false` — проверка на submit.
- **Права**: owner.

### cases.addImageAnnotation / cases.removeImageAnnotation — mutation (правка review-backend №5)
Метки на фото с комментариями — core-функция спеки. Модель `CaseImageAnnotation(id, caseImageId,
x, y /* доли 0..1 */, text)`.
- `{ imageId, x: number(0..1), y: number(0..1), text: string(1..200) }` → `{ annotation }` /
  `{ annotationId }` → `{ ok }`. Лимит 10 меток на фото. Текст — контакт-детект §4 (публичное поле).
- **Права**: owner. **Аналитика**: клиентское `case_photo_tag_added {case_id, tags_count}`.

### cases.submit — mutation (submit → publish в одном действии; идемпотентна)
- **Вход**: `{ caseId, idempotencyKey? }`
- **Выход**: `{ status: 'PUBLISHED' | 'PENDING_REVIEW', publishedAt? }`
- **Проверки `packages/core` в одной транзакции** (+ advisory lock по authorId — §2):
  1. ≥1 обработанное изображение; заполнен `title`; `hasPublishRights === true`
     (иначе `PRECONDITION_FAILED` «Подтвердите права на публикацию фото»);
  2. пары «до/после» валидны;
  3. **Лимит Free** (правка review-backend №3): считаем `count(PUBLISHED) + count(PENDING_REVIEW)`
     — премодерационная очередь занимает слот, иначе лимит обходится восьмью сабмитами новичка.
     `≥ plan.maxPublishedCases (Free=5, PRO=null)` → `FORBIDDEN` `{ messageKey: 'limits.cases',
     message: 'На Free — до 5 опубликованных кейсов. Архивируйте один или подключите PRO',
     details: {used, max} }`. Лимит — **предикат публикации, не инвариант хранения** (§18:
     grandfathering при истечении PRO). Совместные кейсы считаются только у автора (`authorId`),
     у соавторов слот не занимают.
  4. **Trust-tier** (решение 03/4): `NEW` → `PENDING_REVIEW` + `ModerationItem(NEW_USER_PREMOD)`,
     UI честно: «Кейс на быстрой проверке — обычно до 2 часов» (единый текст SLA — p90 из
     admin-драфта); `TRUSTED/VERIFIED` → сразу `PUBLISHED` + индексация в Meilisearch +
     `Notification(case_moderation)`.
- **Права**: owner (specialist). **Аналитика**: `case_submitted {case_id, duration_sec, photos_count, trust_tier}`, `case_published [S] {case_id, trust_tier, time_submit_to_publish_min}` (при мгновенной публикации).

### cases.unpublish / cases.archive / cases.delete — mutation
- `{ caseId }`. `unpublish` → DRAFT (правки), `archive` → ARCHIVED (освобождает слот Free),
  `delete` → soft-delete. Убирают из Meili/лент. ACCEPTED-соавторы получают
  `Notification(collab_case_changed)` — контент не исчезает из их витрин молча (правка review-qa №12).
  **Права**: owner. **Аналитика**: `case_unpublished {to}`.

### cases.publicBySlug — query
- **Вход**: `{ slug }` → **Выход**: `{ case /* контакты в тексте скрыты §4 */, images: [{variants, blurhash, caption, beforeAfter, annotations: [{x, y, text}]}], author: карточка, collaborators: только ACCEPTED [{user, role}], styles, tags, budget: {min, max, usd}, counters, viewerState: {liked, saved, savedToCollections: string[]} | null, related: FeedCard[](6) }`
  SSR **`/c/{slug}`** (канонический маршрут) + OG-карточка (§16). Черновик/архив по прямой ссылке → `NOT_FOUND` для всех, кроме owner/moderator.
- **Права**: guest+. **Аналитика**: клиентское `case_opened {case_id, author_id, source, position}`.

### cases.myList — query
- `{ status?: CaseStatus, cursor?, limit? }` → черновики/на проверке/опубликованные + счётчик слотов
  `{ items, nextCursor, slots: {used, max: number | null} }` (`used` может быть > `max` после
  истечения PRO — §18, UI показывает честно). **Права**: owner (specialist).

### cases.like / cases.unlike — mutation
- `{ caseId }` → `{ liked, likesCount }`. Идемпотентно. **Права**: client, specialist
  (guest → `UNAUTHORIZED` + `auth_required` — момент регистрации). **Аналитика**: `case_liked` / `case_unliked`.

### cases.inviteCollaborator — mutation
- **Вход**: `{ caseId, userSlug: string, role: CaseAuthorRole }` — команда проекта, совместные кейсы.
  **Только slug** (правка review-backend №15): приглашение по номеру телефона удалено — оно
  позволяло энумерацию телефонов и раскрытие профиля по номеру, что противоречит §6
  («существование аккаунта не раскрывается»). «Коллега не в ATELIER» решается ссылкой-приглашением.
- **Выход**: `{ collaborator: {status: 'INVITED'} }` + `Notification(collab_invite)`.
- **Права**: owner. Slug не найден → `NOT_FOUND` «Коллега ещё не в ATELIER — пришлите ему
  ссылку-приглашение» (`details.inviteUrl` — генерик-ссылка регистрации, без привязки к номеру).
- **Аналитика**: `case_collab_tagged {case_id, collab_on_platform}`.

### cases.respondCollaboration — mutation
- `{ caseId, accept: boolean }` → `{ status }`. ACCEPTED → кейс появляется в профиле коллеги
  («рейтинг растёт у всех»). **Права**: приглашённый. **Аналитика**: `case_collab_responded {accept}`.

### cases.leaveCollaboration — mutation (правка review-qa №12)
- `{ caseId }` → `{ status: 'REVOKED' }` — соавтор в любой момент убирает чужой кейс из своего
  портфолио (спорная атрибуция, конфликт); автору — уведомление. Редактирует/удаляет кейс только
  автор. **Права**: ACCEPTED-соавтор.

---

## 9. Модуль `collections`

### collections.saveCase — mutation («момент радости», регистрация в момент ценности)
- **Вход**: `{ caseId, collectionId?: string /* без него — дефолт-коллекция «Сохранённое» (Collection.isDefault) */, caseImageId?: string }`
- **Выход**: `{ saved: true, collection: {id, title}, savesCount }`. Создаёт `Save` + `CollectionItem` (оба идемпотентны).
- **Права**: client, specialist; guest → `UNAUTHORIZED {reason: 'auth_required'}`.
- **Аналитика**: `item_saved {case_id, collection_id, is_new_collection}` — ключевое событие воронки.

### collections.importGuestSaves — mutation (правка review-qa №11)
- **Вход**: `{ items: [{caseId, caseImageId?}] (1..100), idempotencyKey }`
- **Выход**: `{ imported: int, skipped: int }` — атомарная миграция localStorage-сохранений гостя
  после регистрации: одна транзакция, дефолт-коллекция создаётся при отсутствии, несуществующие/
  скрытые кейсы молча пропускаются. Клиент чистит localStorage **только после ответа**.
- **Права**: client, specialist. **Аналитика**: `guest_collection_migrated [S] {items_count}`.

### collections.unsaveCase — mutation
- `{ caseId, collectionId? /* без него — убрать отовсюду */ }` → `{ saved: false, savesCount }`. **Права**: owner Save.

### collections.list — query
- `{ userId? /* чужие — только публичные */, cursor?, limit? }` → `{ items: [{id, title, isPrivate, isDefault, itemsCount, covers: blurhash-превью 4 шт}], nextCursor }`. **Права**: owner — все свои; guest+ — публичные чужие.

### collections.byId — query
- `{ collectionId, cursor?, limit? }` → `{ collection, items: [{case: FeedCard, caseImage?, sortOrder}], nextCursor }`.
  Приватная чужая → `NOT_FOUND` (не `FORBIDDEN` — не раскрываем существование). **Права**: owner | guest+ (публичные).

### collections.create / update / delete — mutation
- `{ title: string(1..60), isPrivate?: boolean }` / `{ collectionId, patch }` / `{ collectionId }` (soft-delete;
  дефолт-коллекцию удалить нельзя — `BAD_REQUEST`). Название проходит контакт-детект (§4).
  Лимит 50 коллекций. **Права**: client, specialist / owner.
- **Аналитика**: `collection_created {source}`.

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
- **Аналитика**: `search_performed {query_len, results_count, has_typo_correction}` — текст запроса
  не шлём; нулевые результаты — срез `results_count = 0` этого же события (отдельного
  `search_zero_results` в реестре нет).

### search.suggest — query
- `{ q: string(1..100) }` → `{ suggestions: [{type: 'case'|'specialist'|'style'|'city', label, slug}] (≤8) }` — автокомплит, debounce на клиенте. **Права**: guest+.

---

## 11. Модуль `briefs`

### briefs.create — mutation
- **Вход**: `{ title: string(5..120), description?: string(..3000), objectType: BriefObjectType, specialization?: Specialization, cityId?, areaM2?, budgetMin?: int, budgetMax?: int, timelineDays?: int, referenceCollectionId?: string /* мудборд */, publish?: boolean (default true) }`
- **Выход**: `{ brief, warnings? }`. `publish: true` → сразу `OPEN` (черновики брифов вторичны).
  Референсы — **копия-снапшот** коллекции (приватный мудборд не форсится в публичность; в мастере
  микрокопия «эти фото увидят специалисты»). Стили брифа для матчинга выводятся из стилей кейсов
  референс-снапшота (фиксация review-backend №26). Описание — контакт-детект (§4).
- **Права**: client, specialist-как-клиент; guest → `auth_required`. Телефон верифицирован — иначе
  `PRECONDITION_FAILED` «Подтвердите телефон, чтобы специалисты могли откликнуться».
- **Аналитика**: `brief_published [S] {brief_id, object_type, budget_min_som, budget_max_som, has_references, references_count, city_id}`.

### briefs.update / briefs.close — mutation
- `{ briefId, patch }` / `{ briefId, reason?: 'hired' | 'cancelled' }` → `CLOSED` (отклики закрыты, треды живут). **Права**: owner.
- **Аналитика**: `brief_closed [S] {brief_id, reason, responses_count}`.

### briefs.listOpen — query (витрина для специалистов)
- **Вход**: `{ filters?: { specialization?, citySlug?, objectType?, budgetMin?, budgetMax? }, cursor?, limit? }`
- **Выход**: `{ items: [{brief /* контакты скрыты §4 */, client: {displayName, avatarUrl, city, completedOrdersCount /* лёгкая репутация клиента */}, responsesCount, viewerState: {responded} | null}], nextCursor }`
- **Права**: specialist (лента брифов — ценность платформы; guest/client видят только счётчик «N открытых брифов» — осознанная защита клиентов от скрейпинга лидов).
- **Аналитика**: клиентское `brief_feed_opened {source, briefs_visible_count}`.

### briefs.byId — query
- `{ briefId }` → бриф + референсы (items снапшота) + для owner'а — отклики. **Права**: owner, откликнувшийся specialist, moderator. Прочим — `NOT_FOUND`.

### briefs.respond — mutation
- **Вход**: `{ briefId, message: string(20..2000), priceEstimate?: int, caseIds?: string[](0..3) /* кейсы из портфолио — правка review-backend №16 */, idempotencyKey? }`
- **Выход**: `{ response: {id, status: 'SENT'}, limits: {usedThisMonth, max} }`
- **Проверки core** (+ advisory lock по specialistId — §2): бриф `OPEN`; один отклик на бриф
  (unique — повтор → `CONFLICT` «Вы уже откликнулись»); `caseIds` — published и принадлежат
  специалисту (join-таблица `BriefResponseCase`); **лимит Free** `maxBriefResponsesMonthly`
  (**Free = 10/мес** — финальный дефолт, живёт в seed `Plan`; PRO = null) → `FORBIDDEN`
  «Лимит откликов этого месяца исчерпан (10 из 10). PRO снимает лимит» + `details: {used, max, resetsAt}`;
  телефон верифицирован. `message` — контакт-детект (§4): дезинтермедиация до заявки, общение — в чате.
  Клиенту — `Notification(brief_response_new)`.
- **Права**: specialist. **Аналитика**: `brief_response_sent [S] {response_id, brief_id, cover_letter_len, cases_attached_count, duration_sec}`.

### briefs.responses — query (сравнение профилей рядом)
- **Вход**: `{ briefId, cursor?, limit? }`
- **Выход**: `{ items: [{response: {…, attachedCases: FeedCard[](..3)}, specialist: SpecialistCard + ReviewAggregate-снимок /* подшкалы для сравнения */}], nextCursor }`
- **Побочно**: первый показ отклика владельцу проставляет `BriefResponse.viewedAt`
  (`SENT → VIEWED`) — специалист видит «просмотрен» (правка review-ux №3).
- **Права**: owner брифа. **Аналитика**: клиентское `compare_opened {brief_id, profiles_count, layout}`.

### briefs.decideResponse — mutation
- **Вход**: `{ responseId, action: 'SHORTLIST' | 'DECLINE' | 'HIDE' | 'ACCEPT', reason?: enum /* для HIDE: price|portfolio|city|other — антисигнал матчинга */ }`
- **Выход**: `{ response, thread?: {id} }`. Словарь статусов единый:
  `SENT → VIEWED → SHORTLISTED → ACCEPTED | DECLINED | HIDDEN`; «выбран другой» — производное
  от `brief_closed(reason=hired)` для остальных откликов. `ACCEPT` → создаёт/находит
  `ChatThread(briefId)` со сторонами, `Notification(brief_response_status)`; дальше — чат и
  `orders.create` из треда.
- **Права**: owner брифа. **Аналитика**: `brief_response_status_changed [S] {response_id, status}`.

### briefs.myResponses — query
- `{ status?, cursor? }` → отклики специалиста со статусами (`VIEWED`/`SHORTLISTED`/…). **Права**: specialist.

---

## 12. Модуль `chat`

REST/tRPC — история и отправка (надёжность, идемпотентность); WS (§17) — реалтайм-доставка.
Контент чата НЕ санитизируется (решение 03/7).

**Заявка = тред** (фиксация review-ux №6): «прямая заявка в 2 клика» — это `chat.start`;
`lead_id` в аналитике = `threadId`. Отдельной сущности Lead нет.

### chat.start — mutation («прямая заявка в 2 клика»)
- **Вход**: `{ specialistUserId, context?: { caseId? | briefId? }, firstMessage: string(1..2000), attachmentUploadIds?: string[](0..5) /* фото/референсы в первом сообщении */ }`
- **Выход**: `{ threadId, message }`. Существует тред пары (+briefId) → возвращается он же (идемпотентно).
- **Права**: client, specialist; guest → `auth_required` (главный момент регистрации клиента).
  Специалист с `acceptsOrders: false` → `PRECONDITION_FAILED` «Специалист сейчас не принимает заказы».
- **Аналитика**: `lead_submitted [S] {lead_id: threadId, specialist_id, has_attachments, time_from_first_view_sec, is_first_lead}` — старт воронки заявки.

### Раскрытие телефона (правка review-backend №4)
Спека: «телефон скрыт ДО заявки» — после заявки раскрывается. Механика:
- участники существующего треда видят телефон второй стороны в карточке `peer`
  (`chat.threads` / `chat.byId`) — **симметрично** обеим сторонам (обе верифицированы OTP);
- первый показ каждой стороне проставляет `ChatParticipant.phoneRevealedAt` и пишет
  `lead_phone_revealed [S] {lead_id, specialist_id}` — контракт спеки измерим;
- фарм телефонов ограничен лимитом `chat.start` (§3) и trust-tier'ом;
- нигде больше телефон не отдаётся (публичный профиль — никогда).

### chat.threads — query
- `{ cursor?, limit? }` → `{ items: [{threadId, peer: карточка + phone /* после заявки, см. выше */, lastMessage: превью, unreadCount, orders: [{id, state}] /* заказов в треде может быть несколько */, brief?: {id, title}}], nextCursor }` — сортировка `lastMessageAt DESC`.
  `unreadCount` — одним `groupBy` по всем тредам страницы (не N+1). **Права**: participant.

### chat.messages — query
- `{ threadId, cursor?, limit? (default 30) }` → `{ items: Message[], nextCursor }` — keyset назад во времени
  (`createdAt DESC` отдаём, рендер реверсом). `Message = { id, senderId, kind: 'TEXT'|'IMAGE'|'FILE', text?, file?: {url /* короткоживущий signed GET */, name, size, mime, blurhash?}, createdAt, deliveredAt?, readAt? }`
- **Права**: participant; прочим `NOT_FOUND`.

### chat.send — mutation
- **Вход**: `{ threadId, kind: 'TEXT' | 'IMAGE' | 'FILE', text?: string(1..4000), uploadId? /* для IMAGE/FILE через §8; PDF/док до 25 МБ */, idempotencyKey /* обязателен: офлайн-ретраи мобильного клиента */ }`
- **Выход**: `{ message }`. Побочно: `lastMessageAt`, WS `message.new` собеседнику, оффлайн-собеседнику
  (нет WS ≥60 с) — `Notification(chat_message)` → Telegram/push.
- **Права**: participant. **Rate limit**: §3. **Ошибки**: «Сообщение пустое»; «Файл ещё загружается».
- **Аналитика**: `chat_message_sent {thread_id, kind, is_first_in_thread}`.

### chat.markRead — mutation
- `{ threadId, upToMessageId }` → `{ unreadCount: 0 }`. Обновляет `lastReadAt`, WS `thread.read` собеседнику. **Права**: participant.

---

## 13. Модуль `orders`

State machine — `data-model-notes.md §1` + правка review-qa №4: добавлен арбитражный исход
`DISPUTED → IN_PROGRESS` (доработка). Все переходы — через процедуры с матрицей прав.
Никаких платёжных операций: `agreedAmountMin/Max`, `timelineDays` — информационные поля.

**История переходов** (правка review-backend №8): каждый переход пишет строку
`OrderEvent(orderId, fromState, toState, byUserId?, reason?, createdAt)` в той же транзакции.
Из неё читаются `timeline` в `orders.byId`, счётчик возвратов (≤3), хронология для арбитража.

### orders.create — mutation
- **Вход**: `{ threadId /* заказ рождается из чата */, title: string(5..120), description?: string(..3000), agreedAmountMin?: int≥0, agreedAmountMax?: int≥min, timelineDays?: int, idempotencyKey? }`
- **Выход**: `{ order: {id, state: 'DISCUSSION'} }`.
- **Определение сторон** (правка review-qa №30): роль в заказе — из **контекста, не из `User.role`**
  (обе стороны могут быть специалистами — дизайнер нанимает фотографа): заказчик = автор брифа
  либо инициатор треда (`chat.start`); исполнитель = вторая сторона. `clientId/specialistId`
  в Order — роли в заказе.
- **Права**: participant треда; телефон инициатора верифицирован (`PRECONDITION_FAILED`
  «Подтвердите телефон — заказы связывают два подтверждённых номера»).
  **Несколько активных заказов в одном треде разрешены** (правка review-qa №8 — повторный клиент
  заказывает второй проект параллельно; velocity-антифрод пары это и так видит); UI при живом
  заказе задаёт мягкий вопрос «создать ещё один?», ошибки нет.
- **Аналитика**: `order_create_started [S] {source: chat|lead|brief, initiated_by}`.

### orders.confirmAgreement — mutation (DISCUSSION → AGREED)
- **Вход**: `{ orderId, expectedState: 'DISCUSSION' }`
- **Выход**: `{ order }`. Проставляет `clientAgreedAt` ИЛИ `specialistAgreedAt` по роли вызывающего;
  вторым подтверждением — переход в `AGREED` (антифрод: оба `phoneVerifiedAt` обязательны, иначе
  `PRECONDITION_FAILED` «Вторая сторона ещё не подтвердила телефон»).
- **Права**: participant. Повторное подтверждение той же стороной — идемпотентный no-op.
- **Аналитика**: первое подтверждение — `order_confirm_requested [S] {order_id, by}`;
  переход — `order_confirmed [S] {order_id, hours_to_confirm, source}`.

### orders.transition — mutation (все остальные переходы)
- **Вход**: `{ orderId, action, expectedState, reason?: string /* обязателен для cancel/dispute/return */, idempotencyKey? }`

  **Матрица допустимых переходов (единственный источник — `packages/core/order`):**

  | action | из → в | КТО может | Побочные эффекты | Событие [S] |
  |---|---|---|---|---|
  | `start_work` | AGREED → IN_PROGRESS | specialist | уведомление клиенту | `order_started {auto: false}` |
  | `deliver` | IN_PROGRESS → DELIVERED | **только specialist** | `deliveredAt`, `autoConfirmAt = +7 дней` (N=7 — финальный конфиг-дефолт), `Notification(order_delivered)` клиенту; воркер шлёт `order_auto_confirm_soon` в T-48 и T-24 **от `autoConfirmAt`** | `order_delivered {days_in_progress, checkpoints_count}` |
  | `confirm_completion` | DELIVERED → COMPLETED | **только client** (или BullMQ-воркер по `autoConfirmAt` — тогда `Order.autoConfirmed = true`) | `confirmedAt/completedAt`, `ClientProfile.completedOrdersCount++`, пересчёт `ReviewAggregate.completedOrdersCount/repeatClientsPct`, **velocity-проверка пары** → аномалия = `ModerationItem(VELOCITY_ANOMALY)`; открывает право на отзыв | `order_completed {confirmation: client|auto, days_delivered_to_completed, checkpoints_count}` |
  | `return_to_work` | DELIVERED → IN_PROGRESS | client (`reason` обязателен) | сброс `deliveredAt/autoConfirmAt` (история сдач остаётся в `OrderEvent`); ≤3 возвратов (считается по OrderEvent), дальше «Похоже, нужна помощь — откройте спор» | `order_returned_for_rework {return_index}` |
  | `cancel` | DISCUSSION \| AGREED \| IN_PROGRESS → CANCELLED | обе стороны (`reason` обязателен) | `cancelledAt/ById/Reason`; терминально. **Из DELIVERED прямой отмены нет — осознанно** (иначе клиент обнуляет сданную работу в обход возврата/спора); путь: `return_to_work` → `cancel` или спор | `order_cancelled {by, stage, reason}` |
  | `open_dispute` | IN_PROGRESS \| DELIVERED → DISPUTED | обе стороны (`reason` обязателен) | `ModerationItem(ORDER, DISPUTE)` — арбитраж (§15): исходы COMPLETED / CANCELLED / **IN_PROGRESS (доработка)** | `order_disputed {by, stage}` |

- **Выход**: `{ order }`. Каждый переход: `OrderEvent` + гранулярное событие в `AnalyticsOutbox` +
  `Notification` второй стороне — в одной транзакции.
- **Ошибки**: недопустимый переход → `PRECONDITION_FAILED` «Из статуса „Сдан“ так нельзя — подтвердите
  приёмку или верните на доработку»; не та роль → `FORBIDDEN` «Сдачу работы предлагает специалист»;
  `expectedState` разошёлся → `PRECONDITION_FAILED` (§2).

### orders.addCheckpoint — mutation
- **Вход**: `{ orderId, title: string(2..120), note?: string(..1000), photoUploadIds: string[](1..10), idempotencyKey? }`
- **Выход**: `{ checkpoint }`. Заказ в `AGREED | IN_PROGRESS | DELIVERED` (первый чек-поинт из AGREED
  автоматически переводит в IN_PROGRESS — `order_started {auto: true}`). Фото — EXIF-стрип (§8).
  Чек-поинты с фото повышают вес будущего отзыва (§14) — UI это прямо говорит специалисту.
- **Права**: participant (обычно specialist). **Аналитика**: `order_checkpoint_added [S] {order_id, checkpoint_index, has_photos}`.

### orders.list — query
- `{ role?: 'client' | 'specialist', state?: OrderState[], cursor?, limit? }` → `{ items: [{order, peer, checkpointsCount, canReview: bool}], nextCursor }`. **Права**: client, specialist (только свои).

### orders.byId — query
- `{ orderId }` → `{ order /* + autoConfirmed */, checkpoints[], review?, timeline: [{fromState, toState, at, by}] /* из OrderEvent */ }`. **Права**: participant, moderator/admin. Прочим `NOT_FOUND`.

---

## 14. Модуль `reviews`

### reviews.create — mutation
- **Вход**: `{ orderId, scores: { quality: int(1..5), timeline: int(1..5), communication: int(1..5), budget: int(1..5) }, text?: string(..3000), photoUploadIds?: string[](..10), idempotencyKey? }`
- **Выход**: `{ review, aggregate: обновлённый ReviewAggregate }`
- **Инварианты `packages/core/reputation` (одна транзакция)**:
  1. `order.state === 'COMPLETED'` — иначе `PRECONDITION_FAILED` «Отзыв можно оставить после завершения заказа»;
  2. `author === order.clientId` — иначе `FORBIDDEN` «Отзыв оставляет клиент заказа»
     (специалист клиента в MVP не оценивает — решение 00/§2; двусторонних отзывов нет,
     включая исходы арбитража);
  3. один отзыв на заказ (`orderId @unique`) → `CONFLICT` «Отзыв по этому заказу уже есть»;
  4. окно: ≤90 дней после `completedAt` (в т.ч. проставленного арбитражем) → `PRECONDITION_FAILED` «Срок для отзыва истёк»;
  5. **вес** `weight`, чистая функция с юнит-тестами, clamp [0.3 .. 1.0]:
     base 0.7; **+0.15** клиент с `Verification(IDENTITY, APPROVED)`;
     **+0.15** у заказа ≥2 чек-поинтов с фото («отзыв с историей работ»);
     **−0.15 при `Order.autoConfirmed`** (правка review-backend №9 / review-qa №3 — обещанная UX
     антифрод-контрмера: авто-подтверждённый заказ = клиент не участвовал в приёмке);
  6. `Review.viaArbitration = true`, если `Order.disputeOpenedAt != null` (пометка для аналитики/антифрода);
  7. пересчёт `ReviewAggregate` (средневзвешенные по подшкалам, avgOverall, repeatClientsPct) — в этой же транзакции;
  8. velocity-антифрод: ≥3 отзывов той же пары за 90 дней → отзыв публикуется, но `ModerationItem(VELOCITY_ANOMALY)`;
  9. `text` — контакт-детект (§4), публичное поле.
  Импорта внешних отзывов НЕТ (решение 03/5) — процедур под это нет намеренно.
- **Права**: client (сторона заказа). **Аналитика**: `review_submitted [S] {review_id, order_id, specialist_id, score_quality, score_timing, score_communication, score_budget, has_text, has_photos, weight, was_autocompleted}` — финал воронки.

### reviews.update — mutation (правка review-backend №17 / review-qa №19)
- **Вход**: `{ reviewId, patch: { scores?, text?, photoUploadIds? } }`
- **Гард core**: `now() ≤ createdAt + 72h` (окно — конфиг `core/reputation` рядом с окном 90 дней)
  → иначе `PRECONDITION_FAILED` «Окно редактирования истекло — напишите в поддержку».
  Пересчёт `ReviewAggregate` в транзакции; `editedAt` проставляется, UI показывает «изменён».
- **Права**: автор отзыва. **Аналитика**: `review_edited [S] {review_id}`.

### reviews.reply — mutation (публичный ответ специалиста)
- **Вход**: `{ reviewId, text: string(1..1000) }` → **Выход**: `{ review }`.
  Один ответ на отзыв (`repliedAt`); текст — контакт-детект §4 (публичное поле).
  Повторный вызов → `CONFLICT` «Ответ уже опубликован».
- **Права**: специалист заказа. **Аналитика**: `review_reply_sent {review_id}`.

### reviews.listBySpecialist — query
- **Вход**: `{ specialistSlug, cursor?, limit?, sort?: 'fresh' | 'weight' }`
- **Выход**: `{ items: [{scores, text /* §4 */, photos, reply?: {text, repliedAt}, weightBadge: 'verified_client' | 'with_checkpoints'[], autoConfirmedBadge: bool, author: {displayName, avatarUrl}, order: {title, completedAt}, createdAt, editedAt?}], nextCursor, aggregate }`
  — `hiddenAt != null` исключены; у каждого отзыва виден контекст «по заказу N» (честность = позиционирование).
- **Права**: guest+ (SSR, schema.org Review). **Аналитика**: клиентское `profile_reviews_viewed {specialist_id, reviews_count}`.

### reviews.myPending — query
- `{}` → `{ items: [{order, autoRemindAt}] }` — завершённые заказы без отзыва (для nudge-уведомлений). **Права**: client.

---

## 15. Модули `moderation` и `admin`

Все мутации этого раздела пишут `AuditLog` (append-only) в транзакции с действием.

### moderation.queue — query
- **Вход**: `{ status?: ModerationStatus (default PENDING), entityType?: ModerationEntityType, reason?: ModerationReason, assignee?: 'me' | 'unassigned', cursor?, limit? }`
- **Выход**: `{ items: [{item, entityPreview /* снапшот сущности: кейс с фото, отзыв, спор с таймлайном заказа (OrderEvent) */, reportsCount}], nextCursor, counts: {pending, byReason} }`
- **Права**: moderator, admin. **Аналитика**: `moderation_queue_viewed`.

### moderation.item — query
- `{ itemId }` → полный контекст: сущность, payload (pHash-совпадения со ссылками на оригиналы, метрики
  аномалии, жалобы), история решений и страйков по автору, **несанитизированный** оригинал текста.
  Открытие документов верификации — отдельная запись в `AuditLog` (каждый просмотр). **Права**: moderator, admin.

### moderation.assign — mutation
- `{ itemId, toSelf: boolean }` → `{ item }`. **Права**: moderator, admin.

### moderation.decide — mutation
- **Вход**: `{ itemId, decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'ESCALATE', resolution?: string, rejectReason?: string /* обязателен при REJECT/REQUEST_CHANGES — уходит автору человеческим языком */, changeRequests?: {imageIds?: string[], codes?: string[]} /* для REQUEST_CHANGES */, disputeResolution?: 'COMPLETE' | 'CANCEL' | 'RETURN_TO_WORK' /* обязателен для споров */, strike?: boolean /* выписать страйк автору */ }`
- **Выход**: `{ item }`. **Побочные эффекты по entityType (транзакционно)**:
  - `CASE (NEW_USER_PREMOD/PHASH/REPORTED)`:
    - APPROVE → **перепроверка лимита Free** (правка review-backend №3: кейс сверх лимита остаётся
      PENDING + уведомление автору) → `PUBLISHED` + индексация + `Notification(case_moderation)`;
      **3-й одобренный кейс** автора (не «подряд»; REJECT/REQUEST_CHANGES слот не сжигают и счётчик
      не сбрасывают — правка review-qa №22) → авто-повышение `trustTier NEW → TRUSTED`;
    - REJECT → `REJECTED` + причина (для неисправимого);
    - **REQUEST_CHANGES** (правка review-backend №18 / review-qa №13) → кейс в `DRAFT` +
      структурированный `changeRequests` (конкретные фото/поля, коды причин из шаблонов);
      item → `CHANGES_REQUESTED`; повторный submit создаёт item с `assigneeId` прежнего модератора.
  - `ORDER (DISPUTE)`: арбитраж — `resolution` и `disputeResolution` обязательны;
    COMPLETE → COMPLETED (открывает клиенту стандартное окно отзыва; «отзывы обеим сторонам»
    из ранних драфтов — ошибка, модель односторонняя), CANCEL → CANCELLED,
    **RETURN_TO_WORK → IN_PROGRESS** (сброс deliveredAt/autoConfirmAt; правка review-qa №4).
    Уведомления обеим сторонам; событие `order_dispute_resolved [S] {resolution, days_to_resolve}`.
  - `REVIEW`: REJECT → `hiddenAt = now()` + пересчёт `ReviewAggregate`
    (`review_hidden_by_moderation [S]`). Отзыв-шантаж блокируется этим путём (жалоба → REJECT),
    не через спор — спор к моменту существования отзыва уже не открыть.
  - `VERIFICATION` (IDENTITY/BUSINESS/**ORG_CLAIM**): APPROVE → бейдж / owner-membership + верификация
    организации (§7A); REJECT → причина. `Notification(verification_result)`, `verification_result [S]`.
  - `USER/MESSAGE/BRIEF`: скрытие контента / предупреждение / страйк / заморозка / бан.
  - `strike: true` → строка `UserStrike(userId, reasonCode, moderationItemId)` (журнал = счётчик);
    3-й страйк → авто-`ModerationItem` на заморозку (решает admin).
  - ESCALATE → админу.
- **Права**: moderator (кроме арбитража споров, заморозок и банов — admin), admin.
- **Аналитика**: `moderation_decided {entity_type, reason, decision, time_to_decide_sec}` +
  `case_moderation_result [S]` для кейсов (SLA премодерации: p50 ≤ 30 мин, p90 ≤ 2 ч;
  пользовательский текст — «обычно до 2 часов»).

### moderation.report — mutation (жалоба; создаёт вход в очередь)
- **Вход**: `{ targetType: 'CASE'|'CASE_IMAGE'|'REVIEW'|'USER'|'BRIEF'|'MESSAGE'|'COLLECTION', targetId, reason: ReportReason /* + FALSE_AFFILIATION, FRAUD */, comment?: string(..500) }`
- **Выход**: `{ ok: true }` (плоско, без раскрытия судьбы). ≥3 открытых жалоб на цель →
  `ModerationItem(REPORTED)`; ≥3 жалоб `abuse_nsfw` → автоскрытие `Case.hiddenAt` до проверки.
  Повторная жалоба того же на то же — идемпотентный no-op.
- **Права**: **guest+** (правка review-backend №14: жалоба на краденое портфолио не должна требовать
  регистрации; `Report.reporterId` nullable + `reporterAnonId`, дедуп по anonId+IP, rate limit §3).
  `reason: FRAUD` маршрутизируется в антифрод-очередь.
- **Аналитика**: `report_created {target_type, reason, is_guest}`.

### admin.* (роль admin; каждая мутация — `AuditLog` + `admin_action {action, target_id}` в outbox)
- **admin.users** — query: `{ q? /* телефон/имя/slug */, role?, trustTier?, frozen?, cursor? }` → пользователи + флаги + страйки.
- **admin.setTrustTier** — mutation: `{ userId, tier: TrustTier, note }`.
- **admin.freezeUser / admin.unfreezeUser** — mutation (правка review-backend №12):
  `{ userId, reason, durationDays?: int }` → `User.frozenAt` (см. §0 «Заморозка»); профиль и контент
  остаются видимыми, мутации ценности блокируются. Уведомление пользователю с причиной.
- **admin.banUser / admin.unbanUser** — mutation: `{ userId, reason }` → soft-delete/восстановление;
  сессии гасятся, контент скрывается из публичных выборок.
- **admin.grantEntitlement** — mutation: `{ userId, planCode: 'PRO', durationDays: int(1..365), note }` →
  ручная активация PRO (решение 03/8). **Аналитика**: `pro_activated [S] {method: 'manual_admin'}`.
- **admin.createPromoCode** — mutation: `{ code?: string /* или автогенерация */, planCode, durationDays, maxRedemptions, expiresAt? }`.
- **admin.taxonomy** — mutations CRUD `Style/Category/City/District/Tag` (slug, nameRu/Ky/En, sortOrder).
- **admin.createBoost** — mutation: `{ target: {caseId} XOR {specialistProfileId}, startsAt, endsAt, priceSom: int }`
  — буст продаётся вручную до платёжек; XOR валидируется core. **Аналитика**: `boost_purchased [S]`.
- **admin.stats** — query: `{ period }` → доменный дашборд: DAU/WAU, воронка клиент→заявка→заказ→отзыв,
  retention-когорты, очередь модерации (тонкий слой поверх PostHog + свои счётчики).

Детектор `device_cluster` (граф общих устройств/IP) — **перенесён в Фазу 1.5** (правка
review-backend №13): в MVP нет носителя данных; при реализации — `AuthEvent(userId, ipHash, uaHash)`
с хэшами (PII-гигиена) и сроком хранения по юр. базе.

---

## 16. REST route handlers (вне tRPC)

| Маршрут | Метод | Назначение |
|---|---|---|
| `/api/webhooks/telegram` | POST | апдейты бота (grammY): `/start <token>` → привязка `telegramChatId`; ответные команды. Защита: `X-Telegram-Bot-Api-Secret-Token` (сравнение с env), иначе 403. Ответ всегда 200 (ретраи TG) |
| `/api/webhooks/payments/{provider}` | POST | заглушка за абстракцией `PaymentProvider` (Mbank/O!Деньги/Элсом/Balance.kg — после мерчант-договоров). Проверка подписи провайдера; идемпотентность по `externalPaymentId`; успех → `Entitlement(source: PAYMENT)`. До договоров возвращает 404 |
| `/api/og/case/{slug}` | GET | OG-изображение кейса 1200×630 (satori/resvg): обложка (`Case.coverImageId`) + заголовок + автор + бейджи. Текст — через `contacts.hide()` (§4 — роут читает кейс мимо tRPC). Кэш: CDN, `s-maxage=86400`, инвалидация по `updatedAt` |
| `/api/og/profile/{slug}` | GET | OG-карточка профиля: обложка, имя, специализация, рейтинг, город. Та же санитизация |
| `/api/auth/google` | GET | redirect на Google OAuth (state в cookie) |
| `/api/auth/google/callback` | GET | обмен кода, создание/линк пользователя через `AuthIdentity` (§6), установка сессии, redirect (`?returnTo=`, только относительные пути) |
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

### Истечение PRO — grandfathering (правка blocker review-qa №2)
Воркер, гасящий истёкший `Entitlement`, контент **не трогает**: лимит Free — предикат
*публикации новых* кейсов, не инвариант хранения. 12 опубликованных кейсов остаются `PUBLISHED`;
`cases.submit` блокируется, пока `count(published+pending) ≥ max` (вернуться к публикациям можно,
заархивировав лишние); `usage` честно показывает `{used: 12, max: 5}`, UI — плашка «кейсы сверх
лимита Free остаются, но новые — в PRO». Правило зафиксировано и для `maxBriefResponsesMonthly`
(израсходованные в PRO-месяце отклики не отзываются).

### billing.redeemPromo — mutation
- **Вход**: `{ code: string(4..32), idempotencyKey? }`
- **Выход**: `{ entitlement: {plan: 'PRO', expiresAt}, message: 'PRO активирован до 5 августа' }`
- **Проверки (транзакция с блокировкой строки кода)**: код активен и не истёк → `NOT_FOUND`
  «Такого промокода нет или он истёк»; `redeemedCount < maxRedemptions` → `CONFLICT` «Код уже использован»;
  повторное применение тем же пользователем → `CONFLICT` «Вы уже активировали этот код».
  Активный PRO → продление (`expiresAt += durationDays`).
- **Права**: client, specialist. **Rate limit**: §3. **Аналитика**: `pro_activated [S] {method: 'promo_code', days_since_signup}`.

Проверка лимитов НЕ дублируется по модулям: `core/entitlements.check(userId, 'publish_case' | 'brief_response')`
вызывается из `cases.submit`, `moderation.decide(APPROVE)` и `briefs.respond` в их транзакциях.

## 19. Модуль `notifications`

In-app центр — источник истины; Telegram и PWA push — каналы доставки. Канонический словарь
типов и матрица «тип × канал × приоритет» — `13-events-notifications.md`, Часть Б.

**Хранение** (правка review-backend №6, №7): `Notification.type: String` — значения только из
реестра `packages/core/notifications` (по образцу реестра аналитики — новые типы без миграции
enum'а); prefs — `User.notificationPrefs Json` (zod-валидация core) + `quietHours` в том же Json;
mute треда — `ChatParticipant.mutedUntil`; push-подписки — модель
`PushSubscription(userId, endpoint @unique, p256dh, auth)`.

### notifications.list — query
- `{ onlyUnread?: boolean, cursor?, limit? }` → `{ items: [{id, type, title, body, payload /* deep-link: {caseId|orderId|threadId|url} */, readAt, createdAt}], nextCursor, unreadCount }`. **Права**: client, specialist.

### notifications.markRead — mutation
- `{ ids: string[] } | { all: true }` → `{ unreadCount }`. Идемпотентно. **Права**: owner каждой
  записи — чужие id **молча игнорируются** (не ошибка, не эффект; фиксация IDOR-ревью).
- **Аналитика**: — (открытие центра логирует клиент: `notification_center_opened`).

### notifications.unreadCount — query
- `{}` → `{ notifications: int, messages: int }` — бейджи (poll-fallback при отсутствии WS).

### notifications.getPrefs / notifications.updatePrefs — query / mutation
- **Модель**: матрица `категория × канал` (категории — Б2 реестра) →
  `{ prefs: { orders: {inApp: true /* всегда, не отключается */, telegram: bool, push: bool}, messages: {...}, social: {...}, briefs: {...}, system: {...} }, quietHours: {start: '22:00', end: '08:00'} | null }`
- `updatePrefs` принимает частичный патч той же формы. Критичные для антифрода уведомления
  (`order_auto_confirm_soon`) игнорируют opt-out Telegram при привязанном боте — авто-подтверждение
  без предупреждения недопустимо. **Права**: owner. **Аналитика**: `notification_settings_changed {category, channel, enabled}`.

### notifications.subscribePush — mutation
- `{ subscription: {endpoint, keys: {p256dh, auth}} }` → `{ ok }` — PWA Web Push (VAPID); iOS — только
  после установки на домашний экран, поэтому первичен Telegram. Идемпотентно по endpoint.

### notifications.muteThread — mutation
- `{ threadId, until: '8h' | 'forever' | null }` → `{ ok }` — mute конкретного чата (Б2). **Права**: participant.

---

## 20. Сводка аналитических событий воронки (сквозная)

Канонические имена (реестр — `13-events-notifications.md` Часть А):

`feed_viewed → case_opened → item_saved / profile_viewed → lead_submitted → order_confirmed →
order_completed → review_submitted` — обязательные свойства: `source`, роль актора,
`anon_id → user_id` алиасинг при `auth_completed` (PostHog identify). Схема событий —
`packages/core/analytics` (типизированный реестр: имя → zod-схема props; писать событие мимо
реестра нельзя). Правило источника: доменные факты (`order_*`, `review_*`, `brief_published`,
`lead_submitted`, `case_published`, `pro_activated`, `notification_sent`) — только сервер [S]
из транзакции; UI-взаимодействия — клиент.

## 21. Открытые вопросы (сужены после ревью)

1. ~~Лимит откликов Free~~ — **решено: 10/мес** (щедрее на холодном старте; живёт в seed `Plan`, меняется без миграции).
2. ~~Лимит фото кейса~~ — **решено: 20** (конфиг core; UX-мастер поправлен).
3. ~~N авто-подтверждения~~ — **решено: 7 дней**, напоминания T-48/T-24 считаются от `autoConfirmAt`.
4. `briefs.listOpen` только специалистам — сознательное сужение (защита клиентов от скрейпинга лидов); публичная лента брифов — если понадобится, отдельным решением.
5. Окно отзыва 90 дней, окно редактирования 72 ч, base-вес 0.7 и штраф −0.15 за авто-подтверждение — дефолты в конфиге `core/reputation`.
6. `message.delivered` требует ack-протокола на клиенте — если дорого для M4, режем до `thread.read` (двойные галочки — nice-to-have).
7. Ретеншн-«вернись» (win-back) в MVP нет — подтверждено.

## 22. Сводка внесённых правок ревью

| # ревью | Правка | Раздел |
|---|---|---|
| backend №1 (blocker) | `User.phone` nullable + `AuthIdentity` — Google OAuth реализуем | §6 |
| backend №2 (blocker) | Пустой `SpecialistProfile` (specialization/cityId nullable) + core-правило публичности | §6 |
| qa №2 (blocker) | Grandfathering при истечении PRO | §18, §8 |
| qa №1 / backend №29 | Отзывы односторонние всегда, в т.ч. после арбитража | §14, §15 |
| backend №3, qa №29 | Лимит Free: PUBLISHED+PENDING_REVIEW, перепроверка на APPROVE, advisory lock | §2, §8, §15 |
| backend №4, ux №6 | Раскрытие телефона участникам треда + `lead_phone_revealed`; заявка = тред; вложения в `chat.start` | §12 |
| backend №5 | Метки на фото: `CaseImageAnnotation` + мутации + санитизация | §8, §4 |
| backend №6, №7 | `Notification.type` — реестр-строка; prefs/push/mute — носители данных | §19 |
| backend №8 | `OrderEvent` — timeline, инициаторы, лимит возвратов | §13 |
| backend №9, qa №3 | `Order.autoConfirmed` + −0.15 в весе отзыва + пропсы событий | §13, §14 |
| backend №10, №11, qa №9 | Модуль `orgs` (search/publicBySlug/claim/reviewMembership), статусы membership, ORG_CLAIM | §7, §7A, §15 |
| backend №12 | Заморозка (`frozenAt`) + `UserStrike` + admin.freezeUser | §0, §15 |
| backend №13 | `device_cluster` → Фаза 1.5 (зафиксировано) | §15 |
| backend №14, qa №15–16 | Жалобы гостей + CASE_IMAGE + FALSE_AFFILIATION/FRAUD + автоскрытие `hiddenAt` | §15, §3 |
| backend №15 | Приглашение соавтора только по slug (энумерация телефонов закрыта) | §8 |
| backend №16, ux №1 | Кейсы в отклике на бриф (`caseIds` + `BriefResponseCase`) | §11 |
| backend №17, qa №19, ux №7 | `reviews.update` (72 ч) + `reviews.reply` | §14 |
| backend №18, qa №13 | `REQUEST_CHANGES` в moderation.decide | §15 |
| qa №4 | Арбитраж: исход `RETURN_TO_WORK` (DISPUTED → IN_PROGRESS) | §13, §15 |
| qa №5 | Отзыв-шантаж — через модерацию отзыва, не спор | §15 |
| qa №6 | `auth.changePhone` + окно отката 72 ч + риск переизданных номеров | §6 |
| qa №7 | `profiles.deleteAccount` (блокировки, анонимизация, окно 7 дней) | §7 |
| qa №8 | Несколько активных заказов в треде | §13 |
| qa №10 | Optimistic concurrency черновика (`baseUpdatedAt`) | §2, §8 |
| qa №11 | `collections.importGuestSaves` + `Collection.isDefault` | §9 |
| qa №12 | `cases.leaveCollaboration`, уведомления соавторам, лимит только у автора | §8 |
| qa №14 | `AuditLog` append-only во всех moderation/admin-мутациях | §0, §15 |
| qa №22, №26, №28, №30; backend №20, №24, №28; ux №3, №11, №14, №15, №21 | Minor: «3-й одобренный», OTP TTL/IP-лимит, запрет cancel из DELIVERED, роли сторон заказа, Redis-challenge, N+1 (cover/unread/индекс), приватный пайплайн документов + автоудаление, статусы отклика VIEWED/HIDDEN, OTP 60 с/6 цифр, маршрут `/c/{slug}`, 20 фото, SLA «до 2 часов» | по тексту |
| ux №5 | Все имена событий приведены к реестру | везде |
