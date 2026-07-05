# Ревью: schema.prisma + api-contract.md против UX-драфтов и спецификации

Статус: ревью бэкенд-контрактов (строгий проход). Проверено: `schema.prisma`, `api-contract.md`,
`data-model-notes.md`, `events-notifications.md` против `ux-client.md`, `ux-specialist.md`,
`ux-agency-admin.md`, `docs/04-product-spec.md`, `docs/03-decisions.md`, `docs/00-prompt-analysis.md`.

**Вердикт по Prisma-синтаксису**: схема синтаксически валидна — все relation-поля парные, двойные связи
на `User` (Review, Order, Follow) корректно именованы, составные ключи/индексы согласованы. Замечания
по содержанию — ниже (в т.ч. №25: `CollectionItem.caseImageId` — скаляр без relation).

**Сводка**: 2 blocker, 16 major, 11 minor. Основной паттерн ошибок: UX-драфты и матрица уведомлений
обещают функциональность (раскрытие телефона, метки на фото, ответ на отзыв, статусы membership,
страйки/заморозки, prefs уведомлений), под которую в схеме и API нет ни данных, ни процедур.

---

## Блокеры

### 1. [blocker] Google OAuth нереализуем на текущей схеме User
- **Файл**: `schema.prisma` (model User) ↔ `api-contract.md` §6 «Google OAuth», §16.
- **Проблема**: контракт создаёт Google-аккаунт с `phoneVerifiedAt = null`, но в схеме
  `User.phone String @unique` — **обязательное** поле. Пользователь без телефона не может быть создан.
  Кроме того, в `User` нет ни `email`, ни `googleId` — привязать Google-идентичность не к чему,
  callback `/api/auth/google/callback` («создание/линк пользователя») не реализуем.
- **Исправление**: `phone String? @unique` (nullable) + добавить `email String? @unique` и
  `googleId String? @unique` (или отдельную таблицу `AuthIdentity(provider, providerId, userId)` —
  лучше, если в Фазе 2 появятся ещё провайдеры). Все процедуры, требующие телефона
  (`briefs.create`, `orders.create`, `chat.start`?) уже проверяют `phoneVerifiedAt` — это остаётся.

### 2. [blocker] «Пустой SpecialistProfile» из auth.verifyOtp невозможен: NOT NULL поля
- **Файл**: `schema.prisma` (SpecialistProfile: `specialization` и `cityId` обязательные) ↔
  `api-contract.md` §6 auth.verifyOtp («Специалисту создаётся пустой SpecialistProfile») ↔
  `ux-specialist.md` Сценарий 1 (тип специалиста выбирается на шаге 3 ПОСЛЕ OTP, город — на шаге 6).
- **Проблема**: в момент verifyOtp ни специализация, ни город ещё не известны — INSERT упадёт.
  Онбординг-мастер по UX идёт после регистрации, значит профиль обязан существовать «пустым».
- **Исправление**: сделать `specialization Specialization?` и `cityId String?` (city relation optional),
  а обязательность для **публичного** профиля обеспечивать в core-правиле «профиль виден в
  ленте/поиске только при заполненных specialization+city» (аналогично прогресс-бару заполненности).
  Альтернатива — создавать SpecialistProfile на шаге 3 онбординга, но тогда поправить контракт verifyOtp.

---

## Major

### 3. [major] Лимит Free (5 кейсов) обходится через премодерацию + race при конкурентных submit
- **Файл**: `api-contract.md` §8 cases.submit (п.3), §15 moderation.decide; `data-model-notes.md` §2.
- **Проблема**: submit считает только `count(PUBLISHED) < 5`, а кейс новичка уходит в `PENDING_REVIEW`
  (не считается). Новичок сабмитит 8 кейсов при 0 опубликованных — все проходят проверку лимита;
  `moderation.decide APPROVE → PUBLISHED` лимит **не перепроверяет** → 8 published на Free.
  Вдобавок заявленный в notes «однострочный апдейт + count» при Read Committed не защищает от
  двух конкурентных submit (оба видят count=4 → 6 published).
- **Исправление**: (а) считать на submit `PUBLISHED + PENDING_REVIEW`; (б) в moderation.decide при
  APPROVE перепроверять лимит (кейс сверх лимита → остаётся PENDING с уведомлением автору);
  (в) от race — advisory lock по authorId (`pg_advisory_xact_lock(hashtext(authorId))`) в транзакции submit.

### 4. [major] «Телефон раскрывается после заявки» — нет ни процедуры, ни поля в ответах API
- **Файл**: `api-contract.md` §7 profiles.publicBySlug («Телефона в ответе НЕТ ни при каких условиях»),
  §12 chat.* ↔ `ux-client.md` Сценарий 1 шаг 8 («телефон специалиста раскрыт») ↔ спека
  («Телефон скрыт **до заявки**») ↔ `events-notifications.md` А.1.5 (`lead_phone_revealed [S]` —
  «контракт „телефон скрыт до заявки“»).
- **Проблема**: спека и UX обещают раскрытие телефона после заявки, событие для этого есть, но ни одна
  процедура телефон не возвращает. Контракт «скрыт до заявки» реализован только в половине «скрыт».
- **Исправление**: добавить телефон второй стороны в `chat.threads`/`chat.messages` (карточка peer)
  для участников треда, где есть заявка/заказ — с записью `lead_phone_revealed` в outbox при первом
  показе. Либо явная мутация `chat.revealPhone {threadId}`. Зафиксировать симметрию: раскрывается ли
  телефон клиента специалисту (UX говорит про телефон специалиста; заявка уже верифицирована OTP).

### 5. [major] «Метки на фото с комментариями» (core-функция спеки) — нет ни модели, ни процедур
- **Файл**: `schema.prisma` (CaseImage — только caption), `api-contract.md` §8 ↔ спека §Кейсы
  («метки на фото с комментариями»), `ux-client.md` Сценарий 1 шаг 4, `events-notifications.md`
  (`case_photo_tag_opened`, `case_photo_tag_added`).
- **Проблема**: события аналитики под метки есть, UX их показывает, а хранить негде и API не умеет.
- **Исправление**: модель `CaseImageAnnotation(id, caseImageId FK, x Decimal, y Decimal, text)`
  (координаты в долях 0..1) + мутации `cases.addImageTag/removeImageTag` (owner) + отдача в
  `cases.publicBySlug.images[]`. Текст меток — в список санитизации §4 (публичное поле).
  Либо осознанно вырезать метки из MVP — тогда чистить спеку/UX/события.

### 6. [major] enum NotificationType не покрывает матрицу уведомлений Б1
- **Файл**: `schema.prisma` (NotificationType) ↔ `events-notifications.md` Б1–Б2.
- **Проблема**: в матрице есть коды без соответствия в enum: `brief_new_match`, `review_request`
  (+напоминание), `brief_zero_responses`, `order_checkpoint`, `brief_response_status`
  (просмотрен/шортлист), `dispute_update` (открыт/решён), `collection_case_updated`, `audience_daily`,
  `stats_weekly_digest`, `project_of_week`, `pro_status`, `boost_ended`, `product_tips`.
  Прятать всё в `SYSTEM`/`ORDER_STATE_CHANGED` нельзя: настройки пользователя (Б2) маппят
  **тип → категорию → канал**, без типов матрица настроек не работает.
- **Исправление**: расширить enum до полного словаря Б1 (или хранить `type String` + реестр типов в
  `packages/core/notifications` по образцу реестра аналитики — гибче при добавлении типов без миграции).

### 7. [major] Настройки уведомлений и push-подписки не обеспечены данными
- **Файл**: `schema.prisma` ↔ `api-contract.md` §19 (notifications.getPrefs/updatePrefs/subscribePush) ↔
  `events-notifications.md` Б2 (тихие часы, mute треда, «пауза 24 ч»), Б5.
- **Проблема**: в схеме нет ни `NotificationPreference` (матрица категория×канал), ни полей тихих часов,
  ни mute треда (Б2), ни `PushSubscription` (endpoint, p256dh, auth — subscribePush некуда писать).
  NotificationService (Б5 шаг 2 «читает prefs») читать нечего.
- **Исправление**: `User.notificationPrefs Json` (валидируется zod-схемой core) + `quietHoursStart/End`
  (или в том же Json) + `ChatParticipant.mutedUntil DateTime?` + модель
  `PushSubscription(id, userId, endpoint @unique, p256dh, auth, createdAt)`.

### 8. [major] История переходов заказа отсутствует: timeline, «by», лимит возвратов
- **Файл**: `schema.prisma` (Order) ↔ `api-contract.md` §13 orders.byId
  (`timeline: [{state, at, by}]`), orders.transition `return_to_work` («≤3 возвратов»),
  `ux-client.md` Сценарий 4 («счётчик возвратов виден модерации», таймлайн статусов),
  `ux-agency-admin.md` Б4 («Хронология заказа: все переходы с датами и инициаторами»).
- **Проблема**: Order хранит по одному timestamp на состояние; `return_to_work` **сбрасывает**
  `deliveredAt/autoConfirmAt` — история сдач теряется; «кто инициировал» не хранится (кроме отмены);
  правило «≤3 возвратов» не на чем посчитать; карточка арбитража Б4 не собирается.
  AnalyticsOutbox не годится — это доставочная очередь, не read-модель.
- **Исправление**: таблица `OrderEvent(id, orderId FK, fromState, toState, byUserId?, reason?, createdAt)`
  — пишется в той же транзакции, что переход; `timeline`, счётчик возвратов и хронология арбитража
  читаются из неё. Дёшево и закрывает три требования разом.

### 9. [major] Авто-подтверждение неотличимо от ручного и не влияет на вес отзыва вопреки UX
- **Файл**: `schema.prisma` (Order.confirmedAt — «клиент подтвердил (или сработало авто-подтверждение)»),
  `api-contract.md` §14 reviews.create п.5 (формула веса) ↔ `ux-client.md` Сценарий 4 шаг 5
  («вес отзыва такой пары ниже» при авто-подтверждении), `ux-specialist.md` Сценарий 4 таблица
  («вес ниже … при авто-подтверждении»), `events-notifications.md` (`order_completed
  {confirmation: enum(client|auto)}`).
- **Проблема**: (а) в Order нет признака способа подтверждения — событие `confirmation: client|auto`
  и пометка «подтверждено автоматически» в UI не на чем строиться (сравнение confirmedAt с
  autoConfirmAt — хрупкая эвристика); (б) формула веса (base 0.7 + верификация + чек-поинты)
  не содержит обещанного UX понижения за авто-подтверждение — расхождение в антифрод-механике.
- **Исправление**: `Order.autoConfirmed Boolean @default(false)` (ставит воркер) + либо добавить
  слагаемое в формулу веса (например, −0.15 при autoConfirmed), либо убрать обещание из обоих
  UX-драфтов. Решение зафиксировать в 03-decisions.

### 10. [major] OrgMembership не соответствует агентскому UX: нет статусов и периодов
- **Файл**: `schema.prisma` (OrgMembership: только `isConfirmed Boolean`) ↔ `ux-agency-admin.md`
  А1 шаг 5 («убрал → status = left, историю храним»), А3 п.1 (`status ∈ {declared, confirmed, left,
  rejected}`, `period_from/period_to`), А3 п.2 (`Case.org_id nullable` — «фиксация для ERD»).
- **Проблема**: UX-драфт прямо фиксирует требования к ERD «чтобы фаза B2B не потребовала миграций» —
  схема их не выполнила. `left`/`rejected` и периоды не представимы; удаление строки теряет историю,
  которая нужна для «работал в X (2024–2026)» и споров «он у нас не работал». `Case.organizationId`
  тоже отсутствует (это аддитивно, но заявлено как «закладываем сейчас»).
- **Исправление**: `status OrgMembershipStatus (DECLARED|CONFIRMED|LEFT|REJECTED)` вместо isConfirmed,
  `startedAt/endedAt DateTime?`; опционально `confirmedById`. Добавить `Case.organizationId String?`
  + relation (или явно записать в notes, что откладывается как аддитивная миграция).

### 11. [major] Модуль организаций отсутствует в API: страница /org/{slug}, автокомплит, claim
- **Файл**: `api-contract.md` (нет модуля `orgs`; только `profiles.update.worksAtOrgName: string`) ↔
  `ux-agency-admin.md` А1–А2.
- **Проблема**: UX-минимум MVP требует: (а) автокомплит по существующим Organization с дедупом
  (А1 шаг 2) — free-text `worksAtOrgName` прямо противоречит этому дизайну и будет плодить дубликаты;
  (б) query публичной страницы-заглушки `/org/{slug}` (шапка, агрегаты, специалисты, кейсы);
  (в) флоу claim (А2): подача с документами, тип `org_claim`, назначение owner, подтверждение
  membership'ов owner'ом. В `Verification` нет `organizationId` — заявку org_claim не к чему привязать,
  и `VerificationKind` не имеет ORG_CLAIM.
- **Исправление**: модуль `orgs`: `orgs.search {q}` (Meili/ILIKE), `orgs.publicBySlug`,
  `orgs.claim {orgId, position, documentUploadIds}`, `orgs.reviewMembership {membershipId, confirm}`
  (owner). В `profiles.update` заменить `worksAtOrgName` на `organizationId | newOrg: {name, cityId}`.
  В Verification: `organizationId String?` + kind `ORG_CLAIM` (или отдельный reason в ModerationItem).

### 12. [major] Страйки и заморозка аккаунта — нет ни данных, ни процедур
- **Файл**: `schema.prisma`, `api-contract.md` §15 (admin.banUser — только бан/soft-delete) ↔
  `ux-agency-admin.md` Б2 (страйки 1/2/3 → заморозка → блокировка), Б6 (`freeze_account`: «нельзя
  создавать заказы/отзывы, профиль виден»), словарь исходов audit log (`strike`, `freeze_account`).
- **Проблема**: градация санкций — ядро модерационного UX — не представима: у User нет ни счётчика/журнала
  страйков, ни состояния «заморожен» (deletedAt — это бан, профиль скрыт, что противоречит «профиль
  виден»). Процедур admin.freezeUser / strike нет.
- **Исправление**: `User.frozenAt DateTime?` (+ проверка в мутациях заказов/отзывов/кейсов) и модель
  `UserStrike(id, userId, reasonCode, moderationItemId?, createdAt)` (журнал = и счётчик, и audit).
  Мутации `admin.freezeUser/unfreezeUser`, страйк — как побочный эффект `moderation.decide`.
  Либо порезать UX до ban-only в MVP — но тогда править Б2/Б6.

### 13. [major] Детектор device_cluster не обеспечен данными: устройства/IP нигде не собираются
- **Файл**: `schema.prisma` ↔ `ux-agency-admin.md` Б6 (правило v1 `device_cluster`, «граф связей …
  общие устройства/IP», severity high).
- **Проблема**: правило заявлено в v1-наборе антифрода, но в схеме нет ни сессий с IP/UA, ни
  device-fingerprint. Сессии в Redis — TTL-хранилище, для ретроспективного графа связей не годится.
- **Исправление**: минимум — `UserDevice(id, userId, ipHash, uaHash, firstSeenAt, lastSeenAt)`
  c записью при логине/OTP (или лог `AuthEvent`). Либо честно перенести `device_cluster` в Фазу 1.5
  и убрать из v1-таблицы Б6. PII-гигиена: хранить хэши, срок хранения — согласовать с юр. базой.

### 14. [major] Жалобы гостей: Б3 разрешает, API и схема запрещают
- **Файл**: `api-contract.md` §15 moderation.report («Права: client, specialist»),
  `schema.prisma` (Report.reporterId — обязательный FK) ↔ `ux-agency-admin.md` Б3 («Для гостя — тоже
  (без регистрации …; антиспам — rate limit по IP)»).
- **Проблема**: прямое противоречие драфтов; гостевая жалоба нереализуема.
- **Исправление**: принять решение. Если гости жалуются: `reporterId String?` + `reporterAnonId String?`
  + права guest+ с IP-rate-limit (§3). Если нет — исправить Б3 (жалоба станет «моментом ценности» —
  что спорно, ведь Б3 аргументирует обратное). Рекомендация: разрешить гостям, дедуп по anonId+IP.

### 15. [major] Энумерация телефонов через cases.inviteCollaborator
- **Файл**: `api-contract.md` §8 cases.inviteCollaborator (`userSlugOrPhone`).
- **Проблема**: ответ различает «пользователь найден» (INVITED) и «не в ATELIER» (NOT_FOUND + inviteUrl) —
  любой специалист может перебором проверять, зарегистрирован ли произвольный номер, и по созданному
  collaborator-объекту узнавать привязанные к номеру имя/профиль. Это противоречит собственному
  принципу контракта («Существование аккаунта НЕ раскрывается», §6 auth.requestOtp) и это утечка
  приватности в продукте, где телефон = идентичность.
- **Исправление**: приглашать только по slug/поиску по имени (публичные данные). Если приглашение
  по телефону нужно продукту — унифицировать ответ («приглашение отправим, если пользователь есть»)
  без раскрытия статуса и без немедленного показа профиля + rate limit + показывать приглашённому,
  кто его позвал, до принятия скрывать профиль приглашённого от приглашающего.

### 16. [major] Кейсы, приложенные к отклику на бриф, — нет ни поля, ни входа API
- **Файл**: `schema.prisma` (BriefResponse), `api-contract.md` §11 briefs.respond ↔ `ux-specialist.md`
  Сценарий 3 шаг 4 («выбор 1–3 кейсов из портфолио, авто-предложены релевантные»), контрмера
  «ранжирование откликов с приложенными кейсами выше», `events-notifications.md`
  (`brief_response_sent.cases_attached_count`).
- **Проблема**: ключевой элемент качества отклика и его ранжирования не хранится и не передаётся;
  экран сравнения клиента («3 кейса в стиле референсов») тоже опирается на это.
- **Исправление**: `BriefResponse.attachedCaseIds String[]` (или join-таблица
  `BriefResponseCase(responseId, caseId)` — чище для FK) + вход `caseIds: string[](0..3)` в
  briefs.respond (валидация: кейсы published и принадлежат специалисту) + отдача в briefs.responses.

### 17. [major] Публичный ответ специалиста на отзыв и редактирование отзыва (72 ч) — нет в модели и API
- **Файл**: `schema.prisma` (Review), `api-contract.md` §14 ↔ `ux-specialist.md` Сценарий 4 шаг 6
  («публичный ответ на отзыв — да»), S19 («Просмотр отзыва + публичный ответ»); `ux-client.md`
  Сценарий 4 шаг 6 («редактирование — окно 72 ч»).
- **Проблема**: оба обещания UX не обеспечены: у Review нет полей ответа, нет процедур
  `reviews.reply` и `reviews.update`.
- **Исправление**: `Review.replyText String?`, `Review.repliedAt DateTime?` + мутация
  `reviews.reply {reviewId, text}` (права: specialist заказа; текст — контакт-детект §4, один ответ);
  `reviews.update {reviewId, patch}` (права: author; core-проверка `createdAt + 72h`, пересчёт
  ReviewAggregate в транзакции). Окно 72 ч — в конфиг core/reputation рядом с окном 90 дней.

### 18. [major] В moderation.decide нет исхода «вернуть на доработку» (REQUEST_CHANGES)
- **Файл**: `api-contract.md` §15 moderation.decide (APPROVE|REJECT|ESCALATE), `schema.prisma`
  (ModerationStatus, CaseStatus) ↔ `ux-agency-admin.md` Б1 шаг 4b (request_changes: кейс → черновик
  автора с пометкой конкретных фото/полей, после правки — к тому же модератору) и 4c (отклонение —
  для неисправимого; «слот из 3 не сгорает»).
- **Проблема**: Б1 различает reject и request_changes семантически (тон, слот, возврат тому же
  модератору) — контракт схлопывает их в REJECT. Полей для «пометить конкретные фото» и привязки
  «тот же модератор» нет.
- **Исправление**: decision `REQUEST_CHANGES` → `Case.status = DRAFT` + `rejectReason`/структурированный
  `changeRequests Json` (imageIds + коды причин из шаблонов Б1); при повторном submit —
  `ModerationItem.assigneeId` прежнего модератора. В `ModerationStatus` добавить
  `CHANGES_REQUESTED` (или переиспользовать PENDING с полем).

---

## Minor

### 19. [minor] Условия заказа: срок и вилка бюджета не хранятся
- **Файл**: `schema.prisma` (Order: только `agreedAmount Int?`) ↔ `ux-client.md` Сценарий 4 шаг 2
  (мини-форма «объём работ, вилка бюджета, срок»), `ux-specialist.md` S17 («сумма-вилка, ориентир срока»).
- **Исправление**: `agreedAmountMin/Max Int?` (вместо одного agreedAmount) и `timelineDays Int?`
  (или `dueAt DateTime?`); прокинуть в orders.create. Всё по-прежнему информационное, без платёжных механик.

### 20. [minor] Хранилище OTP-challenge не специфицировано
- **Файл**: `api-contract.md` §6 (challengeId, 5 попыток, аннулирование) — ни таблицы в схеме, ни
  упоминания Redis-ключей (в отличие от идемпотентности и rate limits, где Redis прописан).
- **Исправление**: одна строка в §6: challenge живёт в Redis (`otp:{challengeId}`, TTL 10 мин,
  счётчик попыток атомарно), код — только хэш. Таблица не нужна.

### 21. [minor] Лимит фото кейса: 20 в API против 30 в UX
- **Файл**: `api-contract.md` §8 cases.attachImage («до 20 фото») ↔ `ux-specialist.md` Сценарий 2 шаг 1
  («мультивыбор до 30»).
- **Исправление**: выровнять число (предлагаю 30 — фотографы недвижимости снимают сериями) и вынести
  в конфиг core.

### 22. [minor] Жалоба на конкретное фото кейса и «автоскрытие до проверки» не выразимы
- **Файл**: `schema.prisma` (ReportTargetType — нет CASE_IMAGE; CaseStatus — нет состояния «скрыт
  модерацией») ↔ `ux-agency-admin.md` Б3 (кнопка «Пожаловаться» на «фото внутри кейса»; автоскрытие
  abuse_nsfw при ≥3 жалоб «до проверки» с последующим восстановлением).
- **Исправление**: добавить `CASE_IMAGE` в ReportTargetType; для скрытия — `Case.hiddenAt DateTime?`
  (не трогать status — восстановление после dismiss возвращает как было; публичные выборки фильтруют
  `hiddenAt: null` тем же Prisma-extension, что и deletedAt).

### 23. [minor] Статусы отклика: нет «просмотрен» и «скрыт с причиной»
- **Файл**: `schema.prisma` (BriefResponseStatus: SENT|SHORTLISTED|DECLINED|ACCEPTED),
  `api-contract.md` §11 briefs.decideResponse ↔ `ux-specialist.md` Сценарий 3 п.6 (статусы «просмотрен»,
  «в чате», «выбран другой»), `ux-client.md` Сценарий 2 («Скрыть отклик + причина — антисигнал для
  матчинга»), `events-notifications.md` (`brief_response_status_changed: viewed|…|hidden`).
- **Исправление**: `BriefResponse.viewedAt DateTime?` (ставится при briefs.responses владельцем),
  action `HIDE` + `reason enum` в decideResponse (маппится на DECLINED + reason, если не хочется
  расширять enum). «В чате/выбран другой» выводимы из треда/ACCEPTED — ок.

### 24. [minor] N+1-риски: обложка карточки ленты, unreadCount тредов, месячный счёт откликов
- **Файл**: `schema.prisma`, `api-contract.md` §5, §12, §18.
- **Детали**: (а) `FeedCard.cover` — первая CaseImage на каждый из 20 кейсов: Prisma
  `include {images: {take:1}}` на старых версиях = запрос на родителя; безопаснее денормализовать
  `Case.coverImageId`/cover-поля (заодно нужен обложке OG-генератора); (б) `chat.threads.unreadCount` —
  считать одним `groupBy(threadId, createdAt > lastReadAt)`, а не по треду, либо денорм
  `ChatParticipant.unreadCount`; (в) счёт `maxBriefResponsesMonthly` — count по specialistId за месяц:
  сменить индекс `@@index([specialistId])` на `@@index([specialistId, createdAt])`.
  Остальное покрыто: ReviewAggregate убирает join'ы рейтинга, keyset-индексы ленты/чата/уведомлений
  соответствуют запросам, velocity-индекс пары есть. Хорошо.

### 25. [minor] Collection: нет признака дефолтной коллекции; миграция гостевых сохранений без процедуры; caseImageId без FK
- **Файл**: `schema.prisma` (Collection, CollectionItem), `api-contract.md` §9 ↔ `ux-client.md`
  Сценарий 3 (коллекция по умолчанию «Сохранённое», «локальная гостевая коллекция мигрирует в аккаунт»,
  событие `guest_collection_migrated [S]`).
- **Исправление**: `Collection.isDefault Boolean @default(false)` (+ partial unique index на
  `(ownerId) WHERE isDefault` через raw-миграцию) — искать по title хрупко при i18n/переименовании.
  Батч-мутация `collections.importLocal {caseIds: string[]}` — одна транзакция + одно серверное
  событие вместо N вызовов saveCase на 3G. `CollectionItem.caseImageId` — добавить relation на
  CaseImage (обложка-«сохранённое фото» не должна тихо протухать при удалении фото).

### 26. [minor] Матчинг брифа «по стилю» и «скорость ответа» в сравнении — нет источника данных
- **Файл**: `schema.prisma` (Brief — нет styles), `api-contract.md` §11 briefs.responses ↔
  `ux-client.md` Сценарий 2 (рассылка брифа «специализация + город + **стиль**»; строка сравнения
  «скорость ответа»).
- **Исправление**: либо join-таблица `BriefStyle`, либо выводить стили из referenceCollection
  (стили сохранённых кейсов) — зафиксировать выбор в контракте. «Скорость ответа» — считать медиану
  из данных чата (первое сообщение специалиста в тредах-заявках) фоновым джобом в поле
  `SpecialistProfile.medianResponseMinutes Int?`, либо убрать строку из экрана сравнения.

### 27. [minor] pHash: «пара помечена „не дубликат“, больше не алертится» — нет хранилища
- **Файл**: `ux-agency-admin.md` Б2 исход 1 ↔ `schema.prisma`.
- **Исправление**: `PhashDismissal(imageIdA, imageIdB, @@unique)` или нормализованный ключ пары в
  ModerationItem.payload с проверкой перед созданием нового item. Без этого модераторы будут разбирать
  одни и те же типовые рендеры по кругу.

### 28. [minor] Документы верификации: конфликт пайплайнов и отсутствие 30-дневного автоудаления
- **Файл**: `api-contract.md` §7 profiles.requestVerification («presigned flow §8») ↔
  `ux-agency-admin.md` Б5 («документы никогда не проходят через общий пайплайн изображений — никаких
  CDN/вариантов/pHash»; «автоудаление через 30 дней после решения»).
- **Исправление**: в §8 явно указать, что scope `verification` минует обработку (нет вариантов, нет
  pHash, приватный бакет, короткоживущие signed GET только для модератора); добавить в Verification
  `documentsPurgedAt DateTime?` + воркер автоудаления (reviewedAt + 30 дней) — сейчас комплаенс-событие
  `verification_docs_purged` нечем породить.

### 29. [minor] Б4: «обе стороны могут оставить отзыв» противоречит решению «отзыв оставляет только клиент»
- **Файл**: `ux-agency-admin.md` Б4 (исход «Завершить заказ»: «Обе стороны могут оставить отзыв») ↔
  `api-contract.md` §14 (инвариант 2: автор = клиент; «специалист клиента в MVP не оценивает —
  решение 00/§2») ↔ `docs/00-prompt-analysis.md` §2.
- **Исправление**: это ошибка UX-драфта, а не бэкенда — API прав. Поправить формулировку Б4
  («клиент может оставить отзыв как обычно»). Пометку `via_arbitration` отдельным полем можно не
  заводить: выводима из `Order.disputeOpenedAt != null` — зафиксировать это в notes.

---

## Инварианты: где живут и что их гарантирует (сводка проверки)

| Инвариант | Механизм | Вердикт |
|---|---|---|
| Отзыв только по COMPLETED-заказу, автор=клиент, 1 на заказ | БД: `Review.orderId @unique`; core: reviews.create §14 п.1–3 в транзакции; DISPUTED→COMPLETED только через арбитраж | ✅ надёжно. Дыр не нашёл: отменённый/спорный заказ отзыв не открывает |
| Лимит Free 5 кейсов | core/entitlements.check из cases.submit | ⚠️ дыра премодерации + race — №3 |
| Лимит откликов Free | core/entitlements.check из briefs.respond + rate limit §3 | ✅ (число 10/мес — открытый вопрос §21.3, согласовать с ux-specialist, где предложено 5) |
| Trust-tiers премодерации | cases.submit ветвление по User.trustTier; повышение — moderation.decide (3-й approve) | ✅ по сути; не хватает REQUEST_CHANGES — №18 |
| Автоскрытие контактов | §4: hide() на чтение публичных полей + детект на запись + ModerationItem(CONTACT_LEAK) при ≥3/7дн; чат не трогаем | ✅ архитектура верная (оригинал в БД цел). Не забыть OG-роуты §16 — они читают кейс мимо tRPC-процедур |
| Взаимные подтверждения заказа | Order.clientAgreedAt/specialistAgreedAt + проверка обоих phoneVerifiedAt в orders.confirmAgreement | ✅ |
| Velocity-антифрод | индекс `[clientId, specialistId, createdAt]` + проверка при confirm_completion и в reviews.create п.7 → ModerationItem | ✅ для пар; device_cluster — №13, санкции — №12 |
| Вес отзыва | core/reputation чистая функция; верификация + чек-поинты | ⚠️ авто-подтверждение — №9 |
| Никаких кредитных/процентных механик | В схеме и API отсутствуют; agreedAmount информационный; явные запреты в обоих драфтах | ✅ |
| Гость видит ленту без регистрации | feed/cases/profiles/search — guest+; мутации ценности → UNAUTHORIZED reason auth_required | ✅ |

## Готовность к Фазе 2

По data-model-notes §5 в основном подтверждаю: деньги в KGS Int + ExchangeRate пара-валютный,
`City.country`, slug-адресация под кастомные домены, `Entitlement.source=PAYMENT`, M2M-таксономии под
AI-теги — аддитивно расширяемы, переделок не требуют. **Не подтверждаю** два пункта: организации
(№10, №11 — B2B-витрина потребует миграции статусов membership, что противоречит заявленной цели
«без миграций») и уведомления (№6, №7 — каналы/настройки придётся перекраивать под любую Фазу 1.5-фичу).

## IDOR-проверка (итог)

Контракт в целом дисциплинирован: `owner/participant` указан почти на каждой процедуре, приватное →
`NOT_FOUND` (не FORBIDDEN) — существование не раскрывается (collections.byId, briefs.byId, orders.byId,
chat.messages, черновики кейсов). Найденные дыры: №15 (энумерация телефонов), №14 (гостевые жалобы —
конфликт, не дыра). Мелочь вне нумерации: у `notifications.markRead {ids}` явно не указана проверка
принадлежности ids вызывающему — добавить строку «Права: owner каждой записи, чужие id молча
игнорируются»; у `orders.create` для треда двух специалистов правило «клиент/специалист определяются
ролями в паре треда» неоднозначно — зафиксировать «клиент = инициатор треда (chat.start)».
