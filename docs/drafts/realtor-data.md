# ATELIER — риелторская вертикаль: дельта модели данных и API

Статус: **черновик data/API-архитектора** к решению владельца «риелторы — первая вертикаль».
Парный продуктовый документ: `drafts/realtor-product.md`. Источники истины не меняются:
`04-product-spec.md`, `03-decisions.md`, `10-ux-flows.md`, `11-data-model.md`, `12-api-contract.md`,
`packages/db/prisma/schema.prisma`.

Принцип дельты: **ни одной новой доменной сущности**. Кейс сделки = `Case` с риелторскими полями;
подтверждение сделки = существующий `Order`; отзыв = существующий `Review`; поручение клиента =
`Brief`. Всё ниже — nullable-поля, enum'ы, одна join-таблица справочного типа и расширения
процедур. M1-схема не ломается: старые вертикали не замечают изменений.

Жёсткие принципы наследуются без оговорок: кейс — история завершённой сделки, не объявление
(анти-скоуп §2 realtor-product); никаких кредитных/процентных механик — в дельте нет ни полей
комиссий, ни ипотечных сущностей; точный адрес объекта не хранится нигде (район/ЖК — максимум);
телефоны скрыты до заявки; отзыв — только по завершённому `Order`.

---

## 1. Расширение `Case` под сделку

### 1.1 Новые enum'ы (Prisma-синтаксис; в схему НЕ внесено — предложение)

```prisma
/// Тип сделки риелторского кейса. SALE/RENT_OUT — риелтор представлял владельца
/// (есть «срок на рынке»); BUY_ASSIST/RENT_ASSIST — подбор для клиента-покупателя/
/// арендатора (срока на рынке нет по определению).
enum DealType {
  SALE        // продажа
  RENT_OUT    // сдача в аренду (сторона владельца)
  BUY_ASSIST  // подбор покупки
  RENT_ASSIST // подбор аренды
}

/// Тип объекта недвижимости. ЕДИНЫЙ enum для Case и Brief:
/// это переименование существующего BriefObjectType на уровне Prisma
/// (@@map сохраняет PG-тип — переименования в БД нет), плюс два
/// аддитивных значения (ALTER TYPE ... ADD VALUE).
enum PropertyType {
  APARTMENT
  HOUSE
  COMMERCIAL
  OFFICE     // уже было в BriefObjectType — сохраняем
  LAND
  NEW_BUILD  // новое значение (аддитивно)
  OTHER      // уже было — сохраняем

  @@map("BriefObjectType")
}

/// Как показывать цену сделки публично. Выбор автора (дефолт — RANGE,
/// фиксация открытого вопроса №1 realtor-product).
enum DealPriceVisibility {
  EXACT  // точная цена
  RANGE  // вилка
  HIDDEN // «цена не разглашается»
}
```

Почему `PropertyType` — не новый enum рядом с `BriefObjectType`: два пересекающихся словаря
«тип объекта» дали бы вечный маппинг в матчинге бриф↔кейс. Prisma-переименование с
`@@map("BriefObjectType")` — zero-cost: PG-тип остаётся, `Brief.objectType` продолжает работать,
код получает честное имя. Существующий справочник `Category` не трогаем — он остаётся
таксономией дизайн-вертикалей; для риелторского кейса канон — `propertyType`
(enum = типобезопасный матчинг с брифом), `categoryId` опционален.

### 1.2 Новые поля `Case` (все nullable — аддитивно)

```prisma
model Case {
  // ... существующие поля без изменений ...

  // ---- Риелторская сделка (заполняются только при dealType != null) ----

  /// Тип сделки. null = не-риелторский кейс: ВСЯ core-валидация риелторских
  /// полей включается предикатом dealType != null, старые вертикали не задеты.
  dealType     DealType?
  propertyType PropertyType?

  /// Цена сделки, СОМЫ (целые KGS — конвенция схемы). Точная цена; обязательна
  /// при visibility=EXACT. При RANGE/HIDDEN может храниться (не показывается) —
  /// пригодится для агрегатов Фазы 1.5 («медианная цена района»), публично
  /// не отдаётся НИКОГДА при visibility != EXACT.
  dealPriceSom Int?
  /// Вилка цены сделки (вход для visibility=RANGE). Осознанно НЕ переиспользуем
  /// budgetMin/budgetMax: у них семантика «бюджет проекта» (дизайн-вертикали),
  /// смешение сломало бы фильтр бюджета ленты. Для риелторского кейса
  /// budgetMin/Max остаются null (core-валидация).
  dealPriceMinSom Int?
  dealPriceMaxSom Int?
  dealPriceVisibility DealPriceVisibility @default(RANGE)

  /// «Продано за 18 дней» — срок экспозиции, введённый автором.
  /// Разрешён ТОЛЬКО для завершённых сделок стороны владельца
  /// (dealType SALE | RENT_OUT); для BUY_ASSIST/RENT_ASSIST — BAD_REQUEST (core).
  /// При наличии подтверждённого Order публично показывается ДЕРИВАТ из дат
  /// заказа с атрибуцией «по данным заказа» (§1.3), авторское значение —
  /// с атрибуцией «по словам специалиста».
  daysOnMarket Int? // core-валидация 1..3650

  /// ЖК/комплекс — максимум геоточности после района (realtor-product §2:
  /// «район/ЖК — да, адрес — никогда»). Свободный текст, проходит контакт-детект.
  complexName String?

  // ---- Подтверждение сделки клиентом (Order-механизм) ----

  /// Завершённый заказ, подтверждающий сделку. @unique = один Order подтверждает
  /// РОВНО один кейс (нельзя навесить одну реальную сделку на пять кейсов).
  /// Инварианты линковки — §1.3.
  confirmedOrderId String? @unique
  confirmedOrder   Order?  @relation("CaseConfirmedOrder", fields: [confirmedOrderId], references: [id])
  /// Денормализованная отметка подтверждения — для индекса/ранжирования.
  /// Источник истины — предикат core (§1.3); поле проставляется/сбрасывается
  /// в той же транзакции, что линковка.
  dealConfirmedAt DateTime?

  // Лента риелторских кейсов и «только подтверждённые».
  @@index([dealType, status, publishedAt(sort: Desc)])
  @@index([districtId, dealType, status])
}

model Order {
  // ... существующие поля без изменений ...
  /// Обратная сторона связи Case.confirmedOrderId (аддитивно, поведение Order не меняется).
  confirmedCase Case? @relation("CaseConfirmedOrder")
}
```

Что **уже есть** и переиспользуется без изменений:

| Нужно вертикали | Уже в схеме |
|---|---|
| Район объекта | `Case.districtId` → `District` — **есть**, ничего добавлять не надо |
| Город | `Case.cityId` |
| Роль автора | `CaseAuthorRole.REALTOR_LISTING` — уже в enum'е |
| Команда подготовки (стейджер/фотограф) | `CaseCollaborator` + роли `STAGING`/`PHOTOGRAPHY` — сетевой эффект из коробки |
| Фото, до/после, метки, pHash, EXIF-стрип | `CaseImage` + пайплайн §8 контракта |
| Черновики, автосейв, trust-tier, лимит Free | без изменений |

### 1.3 `isDealConfirmed` — деривация, не хранимый флаг

Публичный `isDealConfirmed` — **вычисляемый предикат** `packages/core/deals`:

```
isDealConfirmed(case) :=
  case.confirmedOrderId != null
  && order.state === 'COMPLETED'
  && order.specialistId === case.authorId
```

Хранимого boolean нет намеренно — источник истины один (Order), рассинхрон невозможен.
`dealConfirmedAt` — денормализация для сортировки/индекса, проставляется транзакционно.

Инварианты линковки (`cases.linkOrder`, §4.3), проверяются в одной транзакции:
1. `order.state === COMPLETED`;
2. `order.specialistId === case.authorId` (свой заказ);
3. Order ещё не подтверждает другой кейс (`@unique` — гарантия БД);
4. кейс принадлежит вызывающему; `case.dealType != null`;
5. клиенту заказа уходит `Notification(case_deal_linked)` «Риелтор оформил кейс по вашей
   сделке» с превью и кнопкой «Пожаловаться» (`Report(reason: FAKE)`) — лёгкий
   социальный контроль соответствия кейса реальной сделке, без блокирующего подтверждения
   (не поднимаем цену честного пути);
6. дериват срока: `daysOnMarketDerived = ceil((order.deliveredAt − firstInProgressAt) / 1d)`,
   где `firstInProgressAt` — первый переход `AGREED → IN_PROGRESS` из `OrderEvent`.
   Показывается с атрибуцией «по данным заказа»; хранить не нужно (читается из OrderEvent
   при линковке и кладётся в снапшот агрегатов §2).

Отвязка (`cases.unlinkOrder`) сбрасывает `confirmedOrderId`/`dealConfirmedAt` и пересчитывает
агрегаты — понадобится при арбитраже/фроде.

---

## 2. Статистика риелтора: агрегаты и профиль

### 2.1 Профиль (`SpecialistProfile`) — заявляемое

```prisma
model SpecialistProfile {
  // ... существующие поля ...

  /// Типы сделок, с которыми работает риелтор (фильтр/матчинг брифов).
  /// PG-массив enum'а — аддитивно, без join-таблицы (не справочник, а флаги).
  dealTypes DealType[] @default([])

  districts SpecialistDistrict[] // M2M «районы экспертизы»
}

/// Районы экспертизы — M2M по образцу SpecialistStyle (заявляет специалист;
/// «подтверждается географией кейсов» — вычисляемый сигнал, не хранимый).
/// Существующий SpecialistProfile.districtId остаётся как «домашний район»
/// (обратная совместимость), UI риелтора использует M2M. Лимит ≤ 8 районов (core).
model SpecialistDistrict {
  specialistProfileId String
  specialistProfile   SpecialistProfile @relation(fields: [specialistProfileId], references: [id])
  districtId          String
  district            District          @relation(fields: [districtId], references: [id])

  createdAt DateTime @default(now())

  @@id([specialistProfileId, districtId])
  @@index([districtId])
}
```

### 2.2 Агрегаты (`ReviewAggregate`) — доказуемое

`ReviewAggregate` уже де-факто «репутационный снапшот профиля» (там живут
`completedOrdersCount`, `repeatClientsPct` — не только отзывы). Расширяем его, а не заводим
второй агрегат: одна строка на профиль, один транзакционный пересчёт, один read-path
для ленты/сравнения/SSR.

```prisma
model ReviewAggregate {
  // ... существующие поля ...

  /// Подтверждённые сделки: count(Case where dealConfirmedAt != null,
  /// status=PUBLISHED, deletedAt/hiddenAt = null) автора.
  confirmedDealsCount Int @default(0)
  /// Разбивка по типам: {"SALE": 21, "RENT_OUT": 9, "BUY_ASSIST": 4} —
  /// Json, а не 4 колонки: расширение DealType не потребует миграции.
  confirmedDealsByType Json?
  /// Медиана срока экспозиции ТОЛЬКО по подтверждённым SALE/RENT_OUT,
  /// срок — дериват из дат Order (§1.3), не авторские цифры.
  /// null, пока подтверждённых < 3 (не показываем медиану по 1–2 точкам).
  medianDaysOnMarket Int?
  /// Всего опубликованных кейсов сделок (включая неподтверждённые) — знаменатель
  /// для публичной доли «N из M сделок подтверждены».
  dealCasesCount Int @default(0)
}
```

Пересчёт — теми же правилами, что сейчас: в транзакции с событием-триггером
(линковка/отвязка Order, публикация/архив кейса сделки, завершение заказа) + ночной
reconcile. Самозаявленные цифры (`daysOnMarket` без Order) в агрегаты **не входят
никогда** — только атрибуция «по словам специалиста» на самом кейсе.

«Районы, подтверждённые кейсами» — не хранится: считается на лету/в Meili-фасете как
`districts(confirmed cases)`, показывается в профиле рядом с заявленными.

---

## 3. `Brief` под риелторские поручения

Брифу нужны тип поручения, район и ценовые ожидания. Бюджет-вилка (`budgetMin/Max`) и
`areaM2` **уже есть** — для поручения «продать» вилка читается как «ожидания по цене»
(i18n-лейбл, не новое поле).

```prisma
model Brief {
  // ... существующие поля ...

  /// Тип поручения. Тот же enum DealType: «продать» = SALE, «сдать» = RENT_OUT,
  /// «найти купить» = BUY_ASSIST, «найти снять» = RENT_ASSIST — симметрия
  /// бриф↔кейс↔профиль даёт матчинг без маппингов. null = не-риелторский бриф.
  dealType DealType?

  /// Район объекта/поиска. Точный адрес НЕ собираем (анти-скоуп + приватность);
  /// ЖК/ориентир — свободным текстом в description (контакт-детект уже есть).
  districtId String?
  district   District? @relation(fields: [districtId], references: [id])

  @@index([status, dealType, cityId, createdAt(sort: Desc)])
}

model District {
  // ... существующие relations ...
  briefs               Brief[]
  specialistExpertises SpecialistDistrict[]
}
```

Enum-дельта брифа: `Brief.objectType` уже покрывает тип объекта; после переименования
`BriefObjectType → PropertyType` (§1.1) добавляется значение `NEW_BUILD` — «продать
квартиру в новостройке» становится выразимым. Новых статусов брифа не нужно.

Матчинг брифа риелторам (расширение существующего «специализация + город + стили»):
`specialization = REALTOR` → критерии: `dealType ∈ profile.dealTypes` +
`districtId ∈ profile.districts` (город — как раньше); стили для риелторского брифа
не участвуют. Референс-коллекция остаётся опциональной (для «найти купить» клиент может
сохранить кейсы «нравится, как этот риелтор подаёт объекты»).

---

## 4. API-дельта (в терминах `12-api-contract.md`)

### 4.1 `feed` и `search`

`feed.list.filters` — аддитивные опциональные параметры (старые клиенты не ломаются):

```
filters?: {
  ...существующие,
  dealType?: DealType,
  propertyType?: PropertyType,
  districtSlug?: string,        // District уже в схеме; slug в рамках citySlug
  confirmedOnly?: boolean,      // только кейсы с бейджем «подтверждена клиентом»
  maxDaysOnMarket?: int         // «продано быстрее 30 дней» — по ДЕРИВАТУ (подтверждённые);
}                               // неподтверждённые кейсы этим фильтром отсекаются
```

`FeedCard` — расширение выхода:

```
deal?: {
  dealType, propertyType,
  isDealConfirmed: boolean,                     // бейдж карточки
  daysOnMarket?: { value: int, source: 'order' | 'author' },
  priceLabel: { kind: 'EXACT'|'RANGE'|'HIDDEN', som?, minSom?, maxSom?, usd? }
}                                               // usd — по курсу feed.meta, как budget
```

`feed.meta` дополняется `districts` (по городам) и `dealTypes` (для контролов фильтра).

Meilisearch, индекс `cases` — новые filterable-фасеты: `dealType`, `propertyType`,
`isDealConfirmed`, `daysOnMarketBucket` (`<14 / 14–30 / 30–90 / 90+`), `dealPriceBucket`;
`districtSlug` **уже** в фасетах (§10 контракта) — просто начинает заполняться. Индекс
`specialists` — фасеты `dealTypes`, `districtSlugs`, sortable `confirmedDealsCount`.

Ранжирование `relevance`: к `hotScore` добавляется слагаемое подтверждённости —
`+ 0.1 · isDealConfirmed` (кейс без Order публикуется свободно, но при прочих равных ниже;
фиксация realtor-product §5.1). Формула остаётся в одном месте (воркер пересчёта ZSET).

### 4.2 `cases.*`

`cases.createDraft` — вход расширяется: `{ fromOrderId?: string }` — флоу «кейс из заказа»
(основной путь подтверждённого кейса): предзаполняет `dealType`-словарь по контексту,
`title`, вилку из `agreedAmountMin/Max` как черновик цены, и **сразу линкует**
`confirmedOrderId` по инвариантам §1.3 (заказ должен быть `COMPLETED` и своим).

`cases.update.patch` — новые опциональные поля: `dealType?, propertyType?, dealPriceSom?,
dealPriceMinSom?, dealPriceMaxSom?, dealPriceVisibility?, daysOnMarket?, complexName?`.
`complexName`/`description` — контакт-детект §4 контракта + **адрес-детект** (см. §5).

`cases.submit` — дополнительные core-проверки при `dealType != null` (нумерация продолжает
существующий список §8):

5. `propertyType` обязателен; `budgetMin/budgetMax` должны быть null (не смешиваем семантики);
6. цена: `EXACT` → `dealPriceSom` обязателен; `RANGE` → `dealPriceMinSom ≤ dealPriceMaxSom`
   обязательны; `HIDDEN` → публичных требований нет;
7. **`daysOnMarket` разрешён только для `dealType ∈ {SALE, RENT_OUT}`** — «срок на рынке»
   существует только у завершённой сделки стороны владельца; для `BUY_ASSIST/RENT_ASSIST`
   → `BAD_REQUEST` «Срок на рынке указывается для продажи или сдачи»;
8. тексты кейса — прошедшее время не валидируем машинно (UI-микрокопия и модерация,
   realtor-product §2), но детект паттернов объявления («в продаже», «звоните», цена + «торг»)
   → `warnings: ["listing_like_content"]` + при повторах `ModerationItem(REPORTED)`.

Новые мутации:

```
cases.linkOrder    { caseId, orderId }  → { case }   // инварианты §1.3, права: owner
cases.unlinkOrder  { caseId }           → { case }   // owner | moderator (фрод/арбитраж)
```

Обе — транзакционно с пересчётом `ReviewAggregate` (§2.2) и `AnalyticsOutbox`:
`case_deal_linked [S] {case_id, order_id}` / `case_deal_unlinked [S] {by}`.

`cases.publicBySlug` — выход дополняется блоком `deal` (как в FeedCard) +
`confirmedOrder?: { completedAt, hasReview }` (без сумм заказа и без имён клиента).

### 4.3 `profiles.*`

`profiles.update` (specialist): `+ dealTypes?: DealType[], districtIds?: string[](..8)`
(полная замена набора, как `styleIds`).

`profiles.publicBySlug` — `reputation` дополняется:

```
realtorStats?: {                     // присутствует, если у автора есть кейсы сделок
  confirmedDealsCount, dealCasesCount,          // «21 из 34 сделок подтверждены»
  confirmedDealsByType,                          // {SALE: 15, ...}
  medianDaysOnMarket,                            // null при < 3 подтверждённых
  medianDaysOnMarketBasis: int,                  // по скольким сделкам посчитано
  districts: [{slug, nameRu, confirmedCasesCount}]  // заявленные + счёт по кейсам
}
```

`profiles.stats` (owner, дашборд) — к воронке добавляется срез сделок:
`deals: { casesTotal, confirmed, confirmationRatePct, leadsToOrders, ordersToConfirmedCases }` —
владелец видит, где теряется Order-механика (метрика leak-rate из realtor-product §5.3
остаётся серверной аналитикой PostHog, в API владельцу не отдаётся).

### 4.4 `briefs.*`

`briefs.create`: `+ dealType?: DealType, districtId?: string`. При `dealType != null`
`specialization` автоматически `REALTOR` (или валидируется соответствие).
`briefs.listOpen.filters`: `+ dealType?, districtSlug?`. Карточка брифа в выдаче —
`+ dealType, district`. Матчинг-рассылка — по правилу §3.
Права/лимиты (10 откликов Free/мес, только специалистам) — без изменений.

### 4.5 Что в API сознательно НЕ появляется

Никаких `listings.*`, `objects.*`, статуса «в продаже», подписок на цену, карт объектов,
ипотечных данных (анти-скоуп realtor-product §2). Точная цена при `visibility != EXACT`
не отдаётся ни одной процедурой, включая owner-читалки чужих профилей и OG-роуты
(санитизация — в shared-слое чтения, тот же паттерн, что `contacts.hide()`).

---

## 5. Антифрод сделок

Опора на существующий контур (2 верифицированных телефона, velocity пары
`[clientId, specialistId, createdAt]`, вес отзыва, trust-tiers, pHash, `via_arbitration`,
device_cluster в 1.5). Дельта:

**Velocity-правила (новые, `core/antifraud`, все → `ModerationItem(VELOCITY_ANOMALY)`,
публикацию не блокируют — решает модератор):**

| Правило | Порог (конфиг core, стартовые значения) |
|---|---|
| Кейсов сделок одного автора | > 20 за 30 дней (реалистичный максимум активного риелтора ~4–8; консьерж-импорт истории идёт через админский флаг, минуя правило) |
| Завершённых заказов одного специалиста | > 12 за 30 дней ИЛИ > 3 за 24 часа |
| Доля авто-подтверждённых заказов специалиста | > 50% при ≥ 5 заказах за 90 дней (клиенты-боты молчат) |
| Аномальный `daysOnMarket` | медиана авторских значений < 5 дней при ≥ 5 неподтверждённых кейсах (рисуют «продал за 3 дня») |
| Линковки Order→Case | > 5 линковок за 24 часа (пакетное оформление старых заказов — норм для онбординга, сигнал в очередь без санкции) |
| Пары клиент↔риелтор | существующее правило пары без изменений; для риелтора порог тот же — повторные клиенты легальны и ценны, аномалия = ≥ 3 завершённых за 90 дней (уже в §14 контракта) |

**Вес кейса без Order-подтверждения.** Кейс без Order — легален (низкий порог входа), но:
- в ранжировании ленты — без слагаемого `+0.1` (§4.1) и без бейджа;
- в агрегаты профиля (`confirmedDealsCount`, `medianDaysOnMarket`) не входит вообще —
  раздельные счётчики, а не понижающий коэффициент: смешивание «взвешенным средним»
  позволило бы накачать медиану сотней нарисованных кейсов;
- его `daysOnMarket`/цена всегда с атрибуцией «по словам специалиста» — и в UI, и в API
  (`source: 'author'`), фронт не может показать иначе;
- в фильтр `maxDaysOnMarket` и в сортировки по срокам не попадает.

Экономика честности: бейдж и агрегаты достижимы только через Order → выгоднее провести
сделку через платформу, чем рисовать. Фейковый Order ради бейджа упирается в цену:
второй верифицированный телефон, velocity пары/устройств, вес отзыва, `@unique`
(один Order = один кейс) и уведомление клиенту при линковке (§1.3 п.5).

**Адрес-детект** (расширение `core/contacts`): паттерны точных адресов
(«ул. …, д. …», «дом 12, кв 5») в публичных полях кейса → warning + маскирование по
образцу контактов. Защита бывших клиентов; EXIF/GPS-стрип уже в пайплайне.

**Что показываем публично:** бейдж «Сделка подтверждена клиентом», счётчики
«N подтверждённых из M», медиану по подтверждённым с базой расчёта («по 12 сделкам»),
атрибуцию источника цифр. **Не показываем:** сигналы антифрода, очередь модерации,
`via_arbitration`, leak-rate, точную цену при `RANGE/HIDDEN`, суммы заказов, имена
клиентов в блоке подтверждения.

---

## 6. Миграционная стратегия (аддитивно, без ломки M1)

Одна Prisma-миграция + переиндексация Meili; ни одного `DROP`/`ALTER COLUMN`/переименования
в БД, ни одного backfill-требования (все новые поля nullable или с дефолтом).

1. **Enum'ы**: `CREATE TYPE "DealType"`, `CREATE TYPE "DealPriceVisibility"` — новые;
   `ALTER TYPE "BriefObjectType" ADD VALUE 'NEW_BUILD'` — аддитивно. Внимание: в PG
   `ADD VALUE` не выполняется внутри транзакции вместе с его использованием — отдельная
   миграция (или отдельный statement до использующих), Prisma Migrate это требование знает;
   заложить два шага: (а) enum-дельта, (б) всё остальное.
2. **Prisma-переименование** `BriefObjectType → PropertyType` с `@@map("BriefObjectType")` —
   изменение только TS-кода, БД не трогается. Единственный ручной шаг — переименовать
   импорты типа в коде (компилятор найдёт все места).
3. **Колонки**: `Case` (+8 nullable-полей + `dealPriceVisibility` c `DEFAULT 'RANGE'` +
   `confirmedOrderId` c unique-индексом), `Brief` (+2), `SpecialistProfile`
   (+`dealTypes DealType[] DEFAULT '{}'`), `ReviewAggregate` (+4 с дефолтами) —
   мгновенные `ADD COLUMN` без rewrite таблиц (nullable/default в PG 11+).
4. **Таблица** `SpecialistDistrict` — новая, по образцу `SpecialistStyle`.
5. **Индексы**: `Case [dealType, status, publishedAt DESC]`, `[districtId, dealType, status]`,
   `Brief [status, dealType, cityId, createdAt DESC]` — `CREATE INDEX CONCURRENTLY`
   raw-миграцией (таблицы уже с данными на staging/prod).
6. **Seed**: `District` Бишкека/Оша уже есть; сид-дельта — риелторские кейсы с полями
   сделок и частью сгенерированных завершённых Order (перевес по realtor-product §3.1 M5.4).
7. **Meili**: добавить фасеты в конфиг индексов, полная переиндексация воркером
   (Postgres — истина, процедура штатная).
8. **Совместимость**: все новые входные параметры процедур опциональны; новые поля выхода —
   расширение объектов (tRPC/superjson толерантен); существующие кейсы/брифы/профили с
   `dealType = null` проходят все старые ветки валидации без изменений. Откат = не пользоваться
   полями: ни один существующий инвариант M1 не переопределён.

Порядок выката: миграция БД → деплой core-валидаций и процедур → Meili-фасеты →
UI мастера/фильтров. Каждый шаг обратно совместим с предыдущим.

---

## 7. Открытые вопросы (к ревью)

1. Порог показа `medianDaysOnMarket` (предложено ≥ 3 подтверждённых) — согласовать с
   продактом: на холодном старте почти у всех будет null; альтернатива — показывать с
   явной базой «по 1 сделке» с первого Order.
2. Уведомление клиенту при `cases.linkOrder` (п. §1.3.5) — достаточно ли жалобы, или в
   Фазе 1.5 нужен явный клиентский confirm линковки (поднимет честность, но и цену пути).
3. `RENT_OUT` в `daysOnMarket`: включён («сдано за N дней» — та же экспозиция);
   если продукт решит «только продажи» — сужается одной строкой конфига core.
4. Консьерж-импорт истории сделок (Фаза 1.5): нужен ли админский флаг «импортировано
   консьержем» на кейсе (атрибуция + обход velocity-правила №1) — предлагаю да, одно
   nullable-поле `importedAt`, решить до импорта, не сейчас.
