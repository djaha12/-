# ATELIER — событийная аналитика (PostHog) и матрица уведомлений (draft)

Статус: черновик для ревью. Источник истины — `docs/04-product-spec.md`; решения — `docs/03-decisions.md`;
риски — `docs/00-prompt-analysis.md`. Согласован со state machine заказа и таблицами
`Notification` / `AnalyticsOutbox` из `docs/drafts/data-model-notes.md`.

Этот документ — **канонический реестр событий**. События, упомянутые в `ux-client.md` / `ux-specialist.md`,
читаются через него; расхождения ранних драфтов нормализованы (см. §А.7).

Жёсткие принципы, влияющие на схему:
- никаких кредитных/процентных механик — событий про деньги платформы нет и не будет;
- отзыв только по завершённому заказу — воронка заканчивается `review_submitted`, и она серверная;
- гость видит ленту без регистрации — верх воронки живёт на `anon_id`, склейка при `auth_completed`;
- mobile-first + Telegram как основной канал уведомлений — CTR каналов сам является метрикой.

---

# Часть А — схема аналитики (PostHog)

## А.0 Правила naming (обязательны для всех новых событий)

1. **`snake_case`, схема `объект_действие`**, глагол в прошедшем времени для свершившихся фактов:
   `case_published`, `order_completed`. Для UI-взаимодействий — суффиксы `_clicked`, `_viewed`,
   `_opened`, `_shown`, `_dismissed`.
2. **Доменный префикс** — первый сегмент имени: `feed_`, `search_`, `case_`, `profile_`, `auth_`,
   `save_`/`collection_`/`item_`, `lead_`, `brief_`, `chat_`, `order_`, `review_`, `onboarding_`,
   `verification_`, `notification_`, `pro_`, `boost_`, `stats_`, `compare_`, `telegram_`, `push_`.
3. **Свойства** — тоже `snake_case`; типы фиксированы (см. таблицы). Соглашения:
   булевы — `is_*` / `has_*`; счётчики — `*_count`; длительности — `*_sec` / `*_min` / `*_hours`;
   деньги — только сомы, целые, `*_som`; идентификаторы — `*_id: string` (uuid/cuid);
   перечисления — `enum(...)`, значения латиницей в lower_snake.
4. **Никакого PII в свойствах**: ни телефонов, ни имён, ни текстов сообщений/отзывов —
   только id, длины (`*_len`), счётчики и категории. Тексты живут в БД, не в PostHog.
5. **Общие свойства** (super properties, проставляются автоматически на каждом событии):
   `screen: string`, `is_guest: bool`, `platform: enum(web|pwa|telegram_bot)`, `locale: enum(ru|ky|en)`,
   `city_id: string|null`, `user_role: enum(guest|client|specialist|admin)`, `plan: enum(free|pro)|null`,
   `app_version: string`.
6. **Identity**: гость получает `anon_id` (PostHog anonymous id). На `auth_completed` — `identify(user_id)`
   + alias с `anon_id`, чтобы воронка «гость → заявка» не рвалась. Никогда не вызываем `identify`
   до верификации OTP.
7. **Источник события**: UI-события шлёт клиент (posthog-js); **доменные факты** (`order_*`, `review_*`,
   `case_moderation_result`, `brief_response_received`, `notification_sent`, `lead_phone_revealed`) шлёт
   ТОЛЬКО сервер из той же транзакции через `AnalyticsOutbox` → BullMQ → PostHog capture API.
   Правило: если событие влияет на деньги/репутацию/модерацию — источник только сервер.
   Серверные события помечены `[S]` в таблицах.
8. **Реестр — единственный**: `packages/core/analytics/events.ts` — типизированные конструкторы
   (zod-схемы свойств). Клиент и сервер импортируют оттуда; строковых литералов имён в коде нет.
9. **Эволюция**: события не переименовываются никогда. Только аддитивные свойства.
   Устаревшее событие помечается `@deprecated` в реестре и живёт до конца квартала.
10. **Не логируем**: скролл чаще 1 раза на «страницу» ленты, каждый `case_draft_autosaved`
    (троттлинг 1/60 сек), содержимое OTP. Событие «просмотр» карточки в ленте не шлём вовсе —
    достаточно `feed_scrolled.cards_seen_count` (объёмы и стоимость PostHog).

---

## А.1 Воронка 1: посетитель → просмотр кейса → сохранение → заявка → заказ → отзыв

Ключевые шаги воронки для дашборда владельца помечены ★.

### А.1.1 Верх: лента и поиск (гость)

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `feed_viewed` | `source: enum(direct|seo|share|deeplink|internal)`, `filters_active: bool` | Открытие ленты `/`; шаг 1 воронки |
| `feed_scrolled` | `depth_page: int`, `cards_seen_count: int` | Троттлинг: 1 событие на «страницу» бесконечного скролла |
| `feed_filter_opened` | — | Bottom sheet / панель |
| `feed_filter_applied` | `specialist_type: enum|null`, `styles: string[]`, `city_id: string|null`, `budget_min_som: int|null`, `budget_max_som: int|null`, `results_count: int` | |
| `feed_filter_empty_result` | `filters: json` | Сигнал дефицита supply по срезу |
| `search_performed` | `query_len: int`, `results_count: int`, `has_typo_correction: bool` | Текст запроса не шлём (PII-гигиена); срез по нулевым результатам |

### А.1.2 Кейс и профиль

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `case_opened` | `case_id`, `author_id`, `source: enum(feed|search|profile|collection|share|og|brief|notification)`, `position: int|null` | Шаг 2 воронки; `source=og|share` — виральный вход |
| `case_gallery_swiped` | `case_id`, `images_seen_count: int` | 1 событие на сессию просмотра кейса |
| `case_before_after_used` | `case_id` | Слайдер «до/после» |
| `case_photo_tag_opened` | `case_id`, `image_id` | Метки на фото |
| ★ `profile_viewed` | `specialist_id`, `source: enum(case|feed|search|compare|share|direct|notification)`, `is_accepting_orders: bool` | Шаг 3 воронки |
| `profile_reviews_viewed` | `specialist_id`, `reviews_count: int` | Вкладка отзывов |

### А.1.3 Сохранение (момент ценности №1)

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `save_clicked` | `case_id`, `surface: enum(feed|case|profile)` | Намерение; `is_guest` — из общих свойств |
| `guest_save_local` | `case_id` | Сохранение гостя в localStorage до регистрации |
| `item_saved` | `case_id`, `collection_id`, `is_new_collection: bool` | Факт сохранения авторизованным |
| `item_unsaved` | `case_id`, `collection_id` | |
| `collection_created` | `source: enum(save_flow|profile|onboarding)` | |
| `collection_opened` | `collection_id`, `items_count: int` | |
| `guest_collection_migrated` [S] | `items_count: int` | Перенос локальных сохранений после `auth_completed` |
| `save_joy_animation_shown` | `reduced_motion: bool` | Контроль «момента радости» |

### А.1.4 Регистрация в момент ценности

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `auth_sheet_shown` | `trigger: enum(save|lead|brief|brief_response|follow|like)` | Что именно сконвертировало гостя |
| `auth_sheet_dismissed` | `trigger` | Отказ — метрика трения |
| `auth_phone_submitted` | `country_code: string` | Номер не шлём |
| `auth_otp_requested` | `channel: enum(telegram|sms)`, `attempt: int` | Telegram Gateway первичен |
| `auth_otp_channel_switched` | `from: enum(telegram|sms)`, `to: enum(telegram|sms)` | Fallback на SMS |
| `auth_otp_verified` | `channel`, `attempts: int`, `time_to_verify_sec: int` | |
| ★ `auth_completed` [S] | `anon_id: string`, `role: enum(client|specialist)`, `trigger` | Точка identify/alias; когорта retention |

### А.1.5 Заявка → чат

| Событие | Свойства | Комментарий |
|---|---|---|
| `lead_form_opened` | `specialist_id`, `source: enum(profile|case|compare|chat)` | |
| `lead_draft_saved` | `chars_count: int` | Троттлинг 1/30 сек; черновик в localStorage |
| ★ `lead_submitted` [S] | `lead_id`, `specialist_id`, `has_attachments: bool`, `time_from_first_view_sec: int|null`, `is_first_lead: bool` | Шаг 4 воронки; intent гостя доотправляется после OTP |
| `lead_phone_revealed` [S] | `lead_id`, `specialist_id` | Раскрытие телефона — контракт «телефон скрыт до заявки» |
| `chat_opened` | `thread_id`, `source: enum(lead|brief_response|notification|list)` | |
| `chat_message_sent` | `thread_id`, `kind: enum(text|photo|file)`, `is_first_in_thread: bool` | Текст не шлём |
| `chat_attachment_added` | `thread_id`, `kind: enum(photo|file|pdf)` | |

### А.1.6 Заказ (все — [S], из state machine, транзакционно с переходом)

| Событие | Свойства | Комментарий |
|---|---|---|
| `order_create_started` | `source: enum(chat|lead|brief)`, `initiated_by: enum(client|specialist)` | Открыт черновик условий |
| `order_confirm_requested` [S] | `order_id`, `by: enum(client|specialist)` | Первое из двух подтверждений |
| ★ `order_confirmed` [S] | `order_id`, `hours_to_confirm: float`, `source: enum(chat|lead|brief)` | DISCUSSION→AGREED; шаг 5 воронки |
| `order_started` [S] | `order_id`, `auto: bool` | AGREED→IN_PROGRESS (`auto` — по первому чек-поинту) |
| `order_checkpoint_added` [S] | `order_id`, `checkpoint_index: int`, `has_photos: bool` | Повышает вес будущего отзыва |
| `order_delivered` [S] | `order_id`, `days_in_progress: int`, `checkpoints_count: int` | «Сдан» предложил специалист |
| `order_returned_for_rework` [S] | `order_id`, `return_index: int` | DELIVERED→IN_PROGRESS |
| ★ `order_completed` [S] | `order_id`, `confirmation: enum(client|auto)`, `days_delivered_to_completed: float`, `checkpoints_count: int` | Единственный статус, открывающий отзыв |
| `order_cancelled` [S] | `order_id`, `by: enum(client|specialist)`, `stage: enum(discussion|agreed|in_progress)`, `reason: enum(no_agreement|changed_mind|no_response|other)` | |
| `order_disputed` [S] | `order_id`, `by`, `stage: enum(in_progress|delivered)` | Создаёт ModerationItem |
| `order_dispute_resolved` [S] | `order_id`, `resolution: enum(completed|cancelled)`, `days_to_resolve: float` | Арбитраж |

### А.1.7 Отзыв (низ воронки, все [S])

| Событие | Свойства | Комментарий |
|---|---|---|
| `review_form_opened` | `order_id`, `source: enum(notification|order_page|reminder)` | |
| ★ `review_submitted` [S] | `review_id`, `order_id`, `specialist_id`, `score_quality: int(1-5)`, `score_timing: int(1-5)`, `score_communication: int(1-5)`, `score_budget: int(1-5)`, `has_text: bool`, `has_photos: bool`, `weight: float` | Шаг 6, конец воронки |
| `review_hidden_by_moderation` [S] | `review_id`, `reason` | |

---

## А.2 Воронка 2: онбординг специалиста (цель ≤ 10 минут)

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `onboarding_started` | `entry_point: enum(landing|invite|share|concierge|feed_cta)` | `concierge` — ручной онбординг первых 30–50 |
| `onboarding_role_selected` | `specialist_type: enum(realtor|architect|interior_designer|landscape_designer|decorator|visualizer|photographer)` | |
| `onboarding_step_completed` | `step: int`, `step_name: enum(phone|role|name_city|specialization|styles|price_range|avatar_cover|telegram|first_case_offer)`, `time_on_step_sec: int`, `skipped: bool` | Одно событие на шаг — воронка по `step_name` |
| `profile_price_range_set` | `min_som: int`, `max_som: int`, `unit: enum(per_m2|per_project|per_hour)`, `hidden: bool` | USD не шлём — считается по курсу НБКР на клиенте |
| `telegram_link_started` | `source: enum(onboarding|settings|nudge|lead_hint)` | Deep-link `t.me/bot?start=token` |
| ★ `telegram_link_completed` [S] | `source`, `deferred: bool` | `deferred` — привязал позже онбординга |
| `verification_submitted` | `kind: enum(identity|business)` | Документы |
| `verification_result` [S] | `kind`, `verdict: enum(approved|rejected)`, `sla_hours: float` | |
| ★ `onboarding_completed` [S] | `total_time_sec: int`, `profile_completeness_pct: int`, `has_first_case: bool`, `telegram_linked: bool` | Контроль «≤ 10 минут» — p50/p90 по `total_time_sec` |
| `profile_share_clicked` | `channel: enum(whatsapp|telegram|instagram|copy_link)` | Виральность |
| `accepting_orders_toggled` | `enabled: bool` | Статус «принимаю заказы» |

---

## А.3 Воронка 3: публикация кейса (цель ≤ 5 минут с телефона)

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `case_create_started` | `entry_point: enum(onboarding|profile|fab|empty_state|order_completed)`, `is_first_case: bool` | `order_completed` — «кейс из заказа» |
| `case_photos_added` | `count: int`, `total_size_mb: float`, `source: enum(camera|gallery)` | Мультизагрузка |
| `case_photo_upload_failed` | `reason: enum(network|size|format|server)`, `retry_count: int` | Критично для 3G |
| `case_draft_autosaved` | `fields_filled_pct: int` | Троттлинг 1/60 сек |
| `case_draft_resumed` | `case_id`, `hours_since_last_edit: float` | Возврат к черновику |
| `case_before_after_paired` | `case_id`, `pairs_count: int` | |
| `case_photo_tag_added` | `case_id`, `tags_count: int` | Метки с комментариями |
| `case_collab_tagged` | `case_id`, `collab_on_platform: bool` | Совместные кейсы; `false` — коллега ещё не на платформе (виральная петля) |
| `case_rights_confirmed` | `case_id` | Чекбокс прав на публикацию |
| `case_limit_hit` | `published_count: int` | Free-лимит 5 — вход в PRO-воронку |
| ★ `case_submitted` | `case_id`, `duration_sec: int`, `photos_count: int`, `fields_filled_pct: int`, `trust_tier: enum(new|trusted|verified)` | Контроль «5 минут» — p50 `duration_sec` |
| `case_moderation_result` [S] | `case_id`, `verdict: enum(approved|rejected)`, `reason: enum(quality|duplicate|rights|contacts_in_content|other)|null`, `sla_minutes: int` | Только trust-tier `new` |
| ★ `case_published` [S] | `case_id`, `trust_tier`, `time_submit_to_publish_min: float` | Для trusted = мгновенно |
| `case_share_clicked` | `case_id`, `channel: enum(whatsapp|telegram|instagram_story|copy_link)`, `from: enum(success_screen|case_page|profile)` | `instagram_story` — «визитка кейса» |

---

## А.4 Воронка 4: бриф → отклик → чат → заказ

### Сторона клиента

| Событие | Свойства | Комментарий |
|---|---|---|
| ★ `brief_started` | `source: enum(collection|feed|profile|empty_search|nav)` | |
| `brief_step_completed` | `step: int`, `step_name: enum(task|object_type|area|budget|timing|references)` | |
| `brief_draft_autosaved` | `fields_filled_pct: int` | Троттлинг |
| ★ `brief_published` [S] | `brief_id`, `object_type: enum(apartment|house|commercial|land|other)`, `budget_min_som: int|null`, `budget_max_som: int|null`, `has_references: bool`, `references_count: int`, `city_id` | |
| `brief_response_received` [S] | `brief_id`, `response_rank: int`, `hours_since_publish: float` | Серверное зеркало `brief_response_sent` для стороны спроса |
| `brief_zero_responses_24h` [S] | `brief_id`, `city_id`, `object_type` | Сигнал дефицита supply → триггер подсказки |
| `brief_broadened` | `brief_id`, `field: enum(budget|city|type)` | Клиент расширил бриф после подсказки |
| `brief_response_hidden` | `brief_id`, `response_id`, `reason: enum(price|portfolio|city|other)` | |
| `compare_opened` | `brief_id|null`, `profiles_count: int`, `layout: enum(cards|table)` | Сравнение рядом |
| `compare_chat_clicked` | `specialist_id`, `brief_id|null` | Выбор из сравнения |
| `brief_closed` [S] | `brief_id`, `reason: enum(hired|expired|cancelled)`, `responses_count: int` | `hired` → связка с `order_confirmed` |

### Сторона специалиста

| Событие | Свойства | Комментарий |
|---|---|---|
| `brief_feed_opened` | `source: enum(nav|notification|digest)`, `briefs_visible_count: int` | |
| `brief_filter_applied` | `filters: json` | |
| `brief_opened` | `brief_id`, `position: int`, `source: enum(feed|notification)` | |
| `brief_response_started` | `brief_id`, `free_quota_left: int` | |
| ★ `brief_response_sent` [S] | `response_id`, `brief_id`, `cover_letter_len: int`, `cases_attached_count: int`, `duration_sec: int` | |
| `brief_quota_hit` | `quota: int`, `days_to_reset: int` | Вход в PRO-воронку |
| `brief_response_status_changed` [S] | `response_id`, `status: enum(viewed|shortlisted|hidden|chat_started|hired)` | Обратная связь специалисту |

Дальше воронка сливается с А.1.5–А.1.6: `chat_opened(source=brief_response)` → `chat_message_sent` →
`order_create_started(source=brief)` → `order_confirmed`.

### PRO / буст (общие для обеих PRO-точек входа)

| Событие | Свойства |
|---|---|
| `pro_upsell_viewed` | `trigger: enum(case_limit|brief_quota|stats_locked|profile_banner)` |
| `pro_upsell_clicked` | `trigger` |
| `pro_activation_requested` | `method: enum(promo_code|manual_admin)` |
| `pro_activated` [S] | `method`, `days_since_signup: int` |
| `boost_purchased` [S] | `case_id|null`, `profile_boost: bool`, `duration_days: int` |

---

## А.5 Мета-события: уведомления и каналы

Замыкают петлю Части Б — CTR каналов и здоровье доставки видны в том же PostHog.

| Событие | Свойства | Комментарий |
|---|---|---|
| `notification_sent` [S] | `notification_id`, `type: string` (код из Части Б), `channel: enum(inapp|telegram|push)`, `priority: enum(p0|p1|p2)`, `batched: bool`, `batch_size: int|null` | Одно событие на каждый канал доставки |
| `notification_opened` | `notification_id`, `type`, `channel`, `deep_link: string` | Клик/тап; из Telegram — по utm в deep-link |
| `notification_center_opened` | `unread_count: int` | |
| `notification_settings_changed` | `category: string`, `channel`, `enabled: bool` | Мониторим массовые отписки = сигнал спама |
| `push_permission_prompted` | `trigger: enum(onboarding|first_lead|settings)` | Промпт показываем только после ценности |
| `push_permission_result` | `granted: bool` | |
| `telegram_linked` [S] / `telegram_unlinked` [S] | `source` | Дублирует А.2 для симметрии каналов |

---

## А.6 Дашборд владельца: критичные метрики

Реализация — PostHog Insights (Trends / Funnels / Retention / Lifecycle) + тонкий внутренний
дашборд доменных метрик (решение 00/§2: buy, не build).

### Активность
- **DAU / WAU / MAU + stickiness (DAU/MAU)** — разрезы по `user_role` и `platform`.
  «Активен» = любое событие из белого списка осмысленных: `case_opened`, `item_saved`,
  `chat_message_sent`, `lead_submitted`, `brief_*`, `case_draft_autosaved`, `order_*`,
  `stats_dashboard_opened`. Голый `feed_viewed` гостя считаем отдельно как **guest DAU**.
- **Supply-активность**: WAU специалистов с ≥1 из {`chat_message_sent`, `brief_response_sent`,
  `case_draft_autosaved`} — «живое» предложение, а не мёртвые профили.

### Воронки (Funnels, конверсия по шагам + медианное время между шагами)
1. **Гость → заявка** (окно 7 дней, по `anon_id`+alias):
   `feed_viewed` → `case_opened` → `profile_viewed` → `lead_form_opened` → `auth_completed` → `lead_submitted`.
2. **Гость → сохранение**: `feed_viewed` → `case_opened` → `save_clicked` → `item_saved`.
3. **Заявка → заказ → отзыв** (окно 90 дней):
   `lead_submitted` → `chat_message_sent` → `order_confirmed` → `order_completed` → `review_submitted`.
4. **Онбординг специалиста** (окно 24 ч): `onboarding_started` → `onboarding_role_selected` →
   `onboarding_completed`; отдельно p50/p90 `total_time_sec` (цель ≤ 600 сек) и разбивка отвалов по
   `onboarding_step_completed.step_name`.
5. **Публикация кейса** (окно 24 ч): `case_create_started` → `case_photos_added` → `case_submitted`
   → `case_published`; p50 `case_submitted.duration_sec` (цель ≤ 300 сек), % `case_photo_upload_failed`.
6. **Бриф** (окно 7 дней): `brief_started` → `brief_published` → `brief_response_received` →
   `chat_opened` → `order_confirmed`; медиана `brief_response_received.hours_since_publish` (цель < 24 ч),
   % `brief_zero_responses_24h` от `brief_published`.

### Retention (PostHog Retention)
- **D1 / D7 / D30 клиентов**: когорта — первый `auth_completed(role=client)`;
  возврат — событие из белого списка осмысленных.
- **D1 / D7 / D30 специалистов**: когорта — `onboarding_completed`;
  возврат — {`chat_message_sent`, `brief_response_sent`, `case_draft_autosaved`, `stats_dashboard_opened`}.
- **W4-retention опубликовавших кейс**: когорта `case_published` — главный прокси «платформа даёт ценность».

### Здоровье маркетплейса и каналов
- **Скорость ответа supply**: медиана времени `lead_submitted` → первый `chat_message_sent` специалиста
  (цель < 4 ч); % заявок с ответом < 24 ч.
- **Плотность отзывов**: `review_submitted` / `order_completed` (цель > 60%) — топливо репутации.
- **Cancel/dispute rate**: (`order_cancelled` + `order_disputed`) / `order_confirmed`.
- **Автоподтверждения**: доля `order_completed(confirmation=auto)` — если высокая, клиенты не возвращаются подтвердить.
- **Каналы**: % пользователей с `telegram_linked` (цель > 70% специалистов);
  CTR уведомлений = `notification_opened` / `notification_sent` по `channel` и `type`;
  доля `push_permission_result(granted=true)`.
- **Виральность**: доля `case_opened(source=og|share)`; `case_share_clicked` / `case_published`;
  `case_collab_tagged(collab_on_platform=false)` — приглашения коллег.
- **Модерация**: p50 `case_moderation_result.sla_minutes` (обещание «меньше часа»), % rejected по `reason`.
- **Монетизация (без платёжек на старте)**: `pro_upsell_viewed` → `pro_activated`;
  триггеры апселла (`case_limit` vs `brief_quota` vs `stats_locked`).

## А.7 Нормализация ранних драфтов

Канонические имена (устаревшие из `ux-client.md` / `ux-specialist.md` → реестр):
`otp_requested` → `auth_otp_requested`; `otp_verified` → `auth_otp_verified`;
`otp_retry_clicked` → `auth_otp_requested(attempt>1)`; `otp_channel_switched` → `auth_otp_channel_switched`;
`weekly_digest_sent/clicked` → `notification_sent/opened(type=stats_weekly_digest, channel=telegram)`.
Подшкалы отзыва — плоские `score_*`, не вложенный объект `scores` (фильтруемость в PostHog).

---

# Часть Б — матрица уведомлений

## Б.0 Каналы и принципы

| Канал | Роль | Особенности |
|---|---|---|
| **In-app центр** | Источник истины. Получает ВСЁ, всегда, неотключаем | Таблица `Notification`; badge непрочитанного; хранение 90 дней |
| **Telegram-бот** | Основной канал доставки (grammY) | Требует привязки (`t.me/bot?start=token`); кнопки с deep-link; HTML-разметка |
| **Web-push PWA** | Дополнительный | iOS — только после установки на домашний экран (16.4+); короткие тексты; никогда не единственный канал |

Email в MVP нет (рынок живёт в Telegram/WhatsApp; SMTP-инфраструктура не окупается). OTP-коды —
транзакционная авторизация, не уведомления: вне матрицы и настроек, отключить нельзя по определению.

**Приоритеты:**
- **P0 — realtime**: доставка немедленно, все подключённые каналы, тихие часы не действуют.
- **P1 — near-realtime**: доставка ≤ 30 мин, лёгкий батчинг внутри окна, уважает тихие часы.
- **P2 — digest**: только по расписанию (ежедневно 19:00 / еженедельно пн 10:00, локальное время).

**Правила батчинга:**
- **НЕЛЬЗЯ батчить (жёстко)**: новое сообщение в чате, новая заявка, переходы заказа, споры,
  предупреждение об автоподтверждении. Это работа и деньги людей — задержка недопустима.
- Чат — не батчинг, а **collapse**: не чаще 1 Telegram/push-сообщения на тред в 60 сек; последующие
  в окне схлопываются в «+N новых сообщений» (редактирование сообщения бота / collapse-key push).
- **Батчим (P1, окно 30 мин, ключ `user+category`)**: отклики на бриф («+3 новых отклика»),
  новые брифы по профилю специалиста.
- **Только digest (P2)**: лайки/сохранения/подписчики, недельная статистика, советы платформы.
- **Тихие часы** 22:00–08:00 локального времени: P1 копится и доставляется утром одним сообщением,
  P2 — строго по расписанию, P0 — доставляется всегда.
- Прочитано в in-app (`readAt`) до отправки отложенного P1/P2 → внешняя доставка отменяется.

## Б.1 Матрица: событие × каналы

Обозначения: ✅ всегда; ⚙️ по настройке (default on); ➖ нет. In-app = ✅ везде, колонка опущена.

### Специалисту

| Код | Триггер | TG | Push | Прио | Батчинг | Deep-link |
|---|---|---|---|---|---|---|
| `lead_new` | Новая заявка от клиента | ✅ | ✅ | P0 | нет | `/chats/{threadId}` |
| `chat_message` | Сообщение в чате | ✅ | ✅ | P0 | collapse 60 сек/тред | `/chats/{threadId}` |
| `brief_new_match` | Новый бриф по специализации/городу | ⚙️ | ⚙️ | P1 | окно 30 мин | `/briefs/{briefId}` |
| `brief_response_status` | Отклик просмотрен / в шортлисте / выбран | ⚙️ | ➖ | P1 | окно 30 мин | `/briefs/{briefId}/my-response` |
| `order_confirm_needed` | Клиент подтвердил условия, ждём вас | ✅ | ✅ | P0 | нет | `/orders/{orderId}` |
| `order_returned` | Клиент вернул работу на доработку | ✅ | ✅ | P0 | нет | `/orders/{orderId}` |
| `order_completed_sp` | Заказ завершён (клиент/авто) | ✅ | ⚙️ | P1 | нет | `/orders/{orderId}` |
| `order_cancelled` | Заказ отменён другой стороной | ✅ | ✅ | P0 | нет | `/orders/{orderId}` |
| `dispute_update` | Спор: открыт / решение арбитража | ✅ | ✅ | P0 | нет | `/orders/{orderId}/dispute` |
| `review_received` | Новый отзыв | ✅ | ⚙️ | P1 | нет | `/me/reviews/{reviewId}` |
| `case_moderation` | Кейс опубликован / отклонён | ✅ | ⚙️ | P1 | нет | `/me/cases/{caseId}` |
| `verification_result` | Верификация: результат | ✅ | ⚙️ | P1 | нет | `/me/verification` |
| `audience_daily` | Лайки/сохранения за день | ⚙️ | ➖ | P2 | daily digest | `/me/stats` |
| `follower_new` | Новые подписчики | ⚙️ | ➖ | P2 | daily digest | `/me/followers` |
| `stats_weekly_digest` | Недельная статистика профиля | ⚙️ | ➖ | P2 | weekly | `/me/stats?period=week` |
| `project_of_week` | Ваш кейс — «Проект недели» | ✅ | ⚙️ | P1 | нет | `/c/{caseSlug}` |
| `pro_status` | PRO активирован / истекает через 3 дня | ✅ | ➖ | P1 | нет | `/me/pro` |
| `boost_ended` | Буст завершён + итоги | ⚙️ | ➖ | P2 | нет | `/me/stats?boost={id}` |
| `product_tips` | Советы и новости платформы | ⚙️ | ➖ | P2 | weekly | contextual |

### Клиенту

| Код | Триггер | TG | Push | Прио | Батчинг | Deep-link |
|---|---|---|---|---|---|---|
| `chat_message` | Сообщение в чате (в т.ч. ответ на заявку) | ✅ | ✅ | P0 | collapse 60 сек/тред | `/chats/{threadId}` |
| `brief_response_new` | Новый отклик на бриф | ✅ | ⚙️ | P1 | окно 30 мин («+N откликов») | `/briefs/{briefId}/responses` |
| `brief_zero_responses` | 24 ч без откликов + подсказка расширить | ⚙️ | ➖ | P1 | нет (одноразовое) | `/briefs/{briefId}/edit` |
| `order_confirm_needed` | Специалист подтвердил условия, ждём вас | ✅ | ✅ | P0 | нет | `/orders/{orderId}` |
| `order_delivered` | Специалист сдал работу — подтвердите | ✅ | ✅ | P0 | нет | `/orders/{orderId}` |
| `order_auto_confirm_soon` | Автоподтверждение через 48 ч / 24 ч | ✅ | ✅ | P0 | нет (2 касания: T-48, T-24) | `/orders/{orderId}` |
| `order_checkpoint` | Новый чек-поинт с фото | ⚙️ | ⚙️ | P1 | нет | `/orders/{orderId}#checkpoints` |
| `order_cancelled` | Заказ отменён другой стороной | ✅ | ✅ | P0 | нет | `/orders/{orderId}` |
| `dispute_update` | Спор: открыт / решение арбитража | ✅ | ✅ | P0 | нет | `/orders/{orderId}/dispute` |
| `review_request` | Заказ завершён — оставьте отзыв (+1 напоминание через 3 дня, максимум 2 касания) | ✅ | ⚙️ | P1 | нет | `/orders/{orderId}/review` |
| `collection_case_updated` | Автор обновил сохранённый кейс | ⚙️ | ➖ | P2 | daily digest | `/c/{caseSlug}` |
| `product_tips` | Советы и новости платформы | ⚙️ | ➖ | P2 | weekly | contextual |

## Б.2 Настройки пользователя (`/settings/notifications`)

Категории (то, что видит пользователь; коды выше маппятся на категории):

| Категория | Что внутри | In-app | Telegram | Push |
|---|---|---|---|---|
| **Заявки и заказы** | `lead_new`, `order_*`, `dispute_*` | всегда | **неотключаемо** | **неотключаемо**¹ |
| **Сообщения** | `chat_message` | всегда | toggle² + mute треда | toggle + mute треда |
| **Брифы и отклики** | `brief_*` | всегда | toggle | toggle |
| **Отзывы и модерация** | `review_*`, `case_moderation`, `verification_result` | всегда | toggle | toggle |
| **Аудитория** | `audience_daily`, `follower_new`, `project_of_week` | всегда | toggle | toggle |
| **Статистика и дайджесты** | `stats_weekly_digest`, `boost_ended` | всегда | toggle | ➖ |
| **Новости ATELIER** | `product_tips`, `pro_status`³ | всегда | toggle | ➖ |

¹ «Неотключаемо» = внутри подключённого канала. Сам канал пользователь контролирует полностью:
отвязал Telegram / не дал permission на push — доставки в этот канал нет, in-app остаётся.
Транзакционные события заказа — контракт платформы («сдан» подтверждает клиент, автоподтверждение —
только с уведомлением), поэтому per-category off для них не предлагаем.
² Отключение категории «Сообщения» в Telegram — с предупреждением: «Клиенты ждут ответа — без
уведомлений вы будете отвечать медленнее и терять заказы».
³ Истечение PRO дополнительно показывается баннером in-app — не теряется при отключённой категории.

Дополнительно: тихие часы (default 22:00–08:00, можно изменить/выключить), mute конкретного треда
чата (∞ / 8 ч), «пауза всех некритичных на 24 ч» (одна кнопка, гасит P1/P2, P0 остаётся).

## Б.3 Тексты-шаблоны (русский — источник; ky/en через i18n c `// TODO(native-review)`)

Тон: по-человечески, коротко, без канцелярита и без давления. Обращение на «вы» со строчной.
Эмодзи — максимум один и только в Telegram. Push-title ≤ 40 символов, push-body ≤ 120.
Переменные — `{var}`; `{excerpt}` всегда обрезается до 80 символов с многоточием.

### Специалисту

**`lead_new`** — push: «Новая заявка · {client_name}» / «{excerpt}»
Telegram:
> **Новая заявка** от {client_name} ({city}):
> «{excerpt}»
> Клиенты обычно пишут нескольким специалистам — быстрый ответ решает.
> [Открыть заявку]

**`chat_message`** — push: «{sender_name}» / «{excerpt}» (вложение → «📎 Фото» / «📎 Файл»)
Telegram: «**{sender_name}:** {excerpt}» [Ответить]
Collapse: «**{sender_name}:** {excerpt} (+{n} новых)» [Открыть чат]

**`brief_new_match`** — Telegram:
> Новый бриф по вашему профилю: {object_type}, {area} м², {city}. Бюджет: {budget_range}.
> [Посмотреть бриф] [Все брифы]
Батч: «{n} новых брифов по вашему профилю за последние полчаса.» [Смотреть брифы]

**`order_confirm_needed`** — Telegram:
> {client_name} подтвердил условия заказа «{order_title}». Осталось ваше подтверждение — и можно начинать.
> [Подтвердить условия]

**`order_returned`** — Telegram:
> {client_name} посмотрел работу по «{order_title}» и просит доработать:
> «{comment_excerpt}»
> [Открыть заказ]

**`order_completed_sp`** — Telegram:
> Заказ «{order_title}» завершён. Он уже в вашей публичной истории — а когда {client_name} оставит
> отзыв, вырастет и рейтинг. Хорошая работа.
> [Открыть заказ] [Создать кейс из заказа]

**`review_received`** — push: «Новый отзыв ★{avg}» / «{client_name}: „{excerpt}“»
Telegram:
> {client_name} оставил вам отзыв по заказу «{order_title}»: ★{avg}
> «{excerpt}»
> [Читать отзыв]

**`case_moderation` (approved)** — Telegram:
> Кейс «{case_title}» опубликован ✨ Поделитесь ссылкой — в WhatsApp и Telegram она разворачивается
> в красивую карточку.
> [Открыть кейс] [Поделиться]

**`case_moderation` (rejected)** — Telegram:
> Кейс «{case_title}» пока не прошёл модерацию: {reason_text}.
> Поправьте — и отправьте снова, обычно проверка занимает меньше часа.
> [Редактировать кейс]

**`verification_result` (approved)** — Telegram:
> Верификация пройдена — на вашем профиле теперь бейдж «{badge_name}». Профили с бейджем
> вызывают больше доверия у клиентов.
> [Посмотреть профиль]

**`project_of_week`** — Telegram:
> «{case_title}» — проект недели в ATELIER 🏆 Всю неделю он на главной. Поздравляем — это по
> честным метрикам, без магии.
> [Открыть кейс] [Поделиться]

**`stats_weekly_digest`** — Telegram:
> **Ваша неделя в ATELIER**
> Просмотры: {views} ({views_delta}) · Сохранения: {saves} · Заявки: {leads}
> Чаще всего смотрели «{top_case_title}».
> {insight_line — например: «Кейсы с „до/после“ у вас смотрят в {x} раза дольше — добавьте пары в старые кейсы.»}
> [Открыть статистику]

**`audience_daily`** — Telegram (только если за день ≥ 3 событий):
> Сегодня ваши работы сохранили {saves} раз и поставили {likes} лайков. Чаще всего — «{top_case_title}».
> [Открыть статистику]

**`pro_status` (expiring)** — Telegram:
> PRO закончится через 3 дня, {date}. После этого профиль и кейсы останутся на месте, но
> публикация новых кейсов сверх 5 и приоритет в откликах станут недоступны.
> [Продлить PRO]

### Клиенту

**`brief_response_new`** — push: «Отклик на ваш бриф» / «{specialist_name} · {specialization}»
Telegram:
> На ваш бриф «{brief_title}» откликнулся {specialist_name} ({specialization}, {city}).
> [Посмотреть отклик]
Батч: «+{n} новых откликов на «{brief_title}» — всего {total}. Удобнее всего сравнить их рядом.» [Сравнить отклики]

**`brief_zero_responses`** — Telegram:
> На бриф «{brief_title}» пока нет откликов. Так бывает, если бюджет или район слишком узкие —
> брифы с вилкой пошире обычно получают первые отклики в течение суток.
> [Изменить бриф]

**`order_delivered`** — Telegram:
> {specialist_name} отметил работу по заказу «{order_title}» выполненной.
> Посмотрите результат: если всё хорошо — подтвердите, если нет — верните на доработку.
> Без ответа заказ подтвердится автоматически {auto_confirm_date}.
> [Посмотреть результат]

**`order_auto_confirm_soon` (T-48)** — Telegram:
> Напоминаем: заказ «{order_title}» подтвердится автоматически через 2 дня, {auto_confirm_date}.
> Если к результату есть вопросы — сейчас самое время написать специалисту или вернуть работу.
> [Открыть заказ]
(T-24: «…завтра, {auto_confirm_date}…» — текст короче, кнопки те же.)

**`order_checkpoint`** — Telegram:
> {specialist_name} добавил чек-поинт по заказу «{order_title}»: «{checkpoint_title}» — с фото.
> [Посмотреть]

**`review_request`** — Telegram:
> Заказ «{order_title}» завершён. Расскажите, как всё прошло — по качеству, срокам, общению и
> бюджету. Ваш отзыв прочитают те, кто сейчас выбирает специалиста.
> [Оставить отзыв — 2 минуты]
Напоминание (+3 дня, последнее): «Вы завершили заказ у {specialist_name}. Отзыв ещё можно оставить —
это главная валюта репутации на ATELIER.» [Оставить отзыв]

### Общие

**`dispute_update` (opened)** — Telegram:
> По заказу «{order_title}» открыт спор. Модератор изучит переписку и чек-поинты и вернётся с
> решением — обычно в течение 2 рабочих дней. Переписка в чате остаётся открытой.
> [Открыть спор]

**`dispute_update` (resolved)** — Telegram:
> Спор по заказу «{order_title}» решён: {resolution_text}. Если остались вопросы — ответьте на это
> сообщение, мы читаем.
> [Открыть заказ]

**`order_cancelled`** — Telegram:
> Заказ «{order_title}» отменён ({by_whom}). Причина: «{reason_excerpt}». История сохранена в вашем
> списке заказов.
> [Открыть заказ]

**Приветствие бота после привязки** (не уведомление, onboarding-сообщение):
> Готово — Telegram привязан к вашему профилю ATELIER. Сюда будут приходить заявки, сообщения и
> новости по заказам. Что присылать, а что нет — настраивается в один тап.
> [Открыть ATELIER] [Настроить уведомления]

## Б.4 Deep-links

- **Web/PWA**: канонические роуты — `/chats/{threadId}`, `/orders/{orderId}`,
  `/orders/{orderId}/review`, `/orders/{orderId}/dispute`, `/briefs/{briefId}`,
  `/briefs/{briefId}/responses`, `/c/{caseSlug}`, `/{username}`, `/me/cases/{caseId}`,
  `/me/stats`, `/me/pro`, `/settings/notifications`. База — `NEXT_PUBLIC_APP_URL` (решение 03/11).
- **Из Telegram**: кнопки — URL-кнопки на web-роуты с
  `?utm_source=telegram&utm_campaign={type}&nid={notificationId}` — по ним считается
  `notification_opened`. PWA-манифест перехватывает URL, если приложение установлено.
- **Из push**: `data.url` — тот же роут c `utm_source=push&nid=…`; клик по нотификации =
  `notification_opened(channel=push)`.
- **Привязка бота**: `t.me/{BOT_NAME}?start=link_{one_time_token}` (токен одноразовый, TTL 15 мин,
  подпись HMAC) — из онбординга, настроек и nudge-подсказок. Успех = `telegram_link_completed`.
- **In-app центр**: каждая запись `Notification` хранит `deepLink: string` — тап ведёт туда же,
  что и внешние каналы; `readAt` проставляется при открытии.

## Б.5 Пайплайн доставки (сводка для инженеров)

1. Доменное событие (транзакция) → строка `Notification` (in-app, всегда) + запись в `AnalyticsOutbox`.
2. `NotificationService` (apps/services, BullMQ): читает prefs пользователя → план доставки по каналам.
3. P0 — немедленные джобы; P1 — delayed job с ключом `batch:{userId}:{category}` (окно 30 мин,
   повторные события инкрементят счётчик батча); P2 — cron-джобы digest (19:00 daily / пн 10:00 weekly,
   таймзона пользователя, дефолт Asia/Bishkek).
4. Перед внешней отправкой P1/P2: если `Notification.readAt != null` — скип канала.
5. Каждая фактическая отправка → `notification_sent`; ошибки Telegram (бот заблокирован) →
   пометка канала недоступным + nudge в in-app «переподключите Telegram».
6. Chat collapse: ключ `chat:{threadId}:{userId}`, окно 60 сек, редактирование последнего
   сообщения бота («+N новых») вместо нового.

---

## Открытые вопросы (на ревью Dars)

1. Тихие часы для P0-сообщений чата: доставлять всегда (текущий дефолт) или дать опцию
   «ночью не будить даже чатом» (споры и автоподтверждение — всегда)?
2. `brief_new_match` для специалистов: default on (растим отклики) или default off (боимся спама
   до настройки фильтров)? Предлагаю on + первое сообщение с кнопкой «Настроить фильтры брифов».
3. Ретеншн-письма «вернись» (win-back) сознательно не включены в MVP — подтвердить.
4. N для автоподтверждения = 7 дней (data-model-notes) → касания T-48/T-24 захардкожены под неделю;
   если N станет конфигурируемым per-order, расписание касаний должно считаться от `autoConfirmAt`.
