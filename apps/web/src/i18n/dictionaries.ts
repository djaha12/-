/**
 * i18n ru/ky/en (M10, фундамент): словари хрома. Локаль живёт в cookie без
 * URL-префиксов (решение docs/03 §21) — SEO остаётся ru-first (GTM §9.6),
 * ky — сигнал «мы местные» и задел на Ош, en — хром для экспатов.
 * ru — источник типа: ky/en обязаны покрыть каждый ключ (ошибка компиляции).
 * Доменные строки (кейсы, заказы, мастера) переводятся следующими слайсами.
 */

export const LOCALES = ['ru', 'ky', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'ru'
export const LOCALE_COOKIE = 'atelier_locale'

/** Названия языков — всегда на самом языке (не переводятся) */
export const LOCALE_LABEL: Record<Locale, string> = {
  ru: 'Русский',
  ky: 'Кыргызча',
  en: 'English',
}

const ru = {
  header: {
    projects: 'Проекты',
    specialists: 'Специалисты',
    briefs: 'Брифы',
    searchPlaceholder: 'Специалист, район или стиль…',
    login: 'Войти',
    imSpecialist: 'Я специалист',
    city: 'Бишкек',
    search: 'Поиск',
    moderation: 'Модерация',
    notifications: 'Уведомления',
    notificationsUnread: 'Уведомления, непрочитанных: {n}',
    messages: 'Сообщения',
    saved: 'Сохранённое',
    menu: 'Меню',
    profile: 'Профиль',
    nav: 'Основная навигация',
  },
  footer: {
    tagline: 'Портфолио и честная репутация специалистов недвижимости Кыргызстана.',
    forClients: 'Клиентам',
    forSpecialists: 'Специалистам',
    atelier: 'Ателье',
    projects: 'Проекты',
    specialists: 'Специалисты',
    createBrief: 'Создать бриф',
    howToChoose: 'Как выбирать',
    placePortfolio: 'Разместить портфолио',
    pricing: 'Тарифы',
    publishingRules: 'Правила публикации',
    verification: 'Верификация',
    about: 'О платформе',
    terms: 'Оферта',
    privacy: 'Конфиденциальность',
    support: 'Поддержка',
    copyright: '© 2026 Ателье · Бишкек',
  },
  login: {
    title: 'Вход или регистрация',
    codeTitle: 'Код из Telegram',
    subtitle: 'Один номер — и для клиентов, и для специалистов.',
    phoneLabel: 'Номер телефона',
    getCode: 'Получить код',
    codeHint: 'Код придёт в Telegram',
    sentTo: 'Отправили на {phone}.',
    changeNumber: 'Изменить номер',
    devCode: 'Dev-режим: ваш код {code}',
    codeLabel: 'Код подтверждения',
    signIn: 'Войти',
    resendIn: 'Не пришло? Отправим снова через {n} сек',
    resend: 'Отправить ещё раз',
    legalPrefix: 'Продолжая, вы принимаете',
    legalTerms: 'условия сервиса',
    legalAnd: 'и',
    legalPrivacy: 'политику конфиденциальности',
    legalSuffix: '',
  },
  home: {
    title: 'Реальные проекты. Проверенные специалисты.',
    subtitle:
      'Интерьеры, архитектура и сделки риелторов Кыргызстана — с отзывами только по завершённым заказам.',
    filters: 'Фильтры',
    all: 'Все',
    deals: 'Сделки риелторов',
    projects: 'Проекты',
    confirmedOnly: 'Подтверждённые клиентом',
    emptyTitle: 'Здесь пока пусто',
    emptyDesc:
      'По этому фильтру ничего не нашлось. Посмотрите все проекты — или станьте первым, кто опубликует такой кейс.',
    feed: 'Лента проектов',
  },
  catalog: {
    title: 'Специалисты',
    subtitle:
      'Выбирайте по реальным работам и отзывам — они оставляются только по завершённым заказам.',
    resultsFor: 'Результаты по запросу «{q}»',
    reset: 'сбросить',
    all: 'Все',
    realtors: 'Риелторы',
    interior: 'Дизайн интерьера',
    architecture: 'Архитектура',
    landscape: 'Ландшафт',
    staging: 'Хоумстейджинг',
    viz3d: '3D',
    photo: 'Фото',
    district: 'Район:',
    filters: 'Фильтры',
    list: 'Список специалистов',
    emptyTitle: 'Никого не нашлось',
    emptyDesc:
      'Попробуйте убрать фильтры или изменить запрос — специалистов в каталоге больше, чем кажется.',
  },
} as const

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> }
export type Dict = DeepString<typeof ru>

const ky: Dict = {
  header: {
    projects: 'Долбоорлор',
    specialists: 'Адистер',
    briefs: 'Брифтер',
    searchPlaceholder: 'Адис, район же стиль…',
    login: 'Кирүү',
    imSpecialist: 'Мен адисмин',
    city: 'Бишкек',
    search: 'Издөө',
    moderation: 'Модерация',
    notifications: 'Билдирмелер',
    notificationsUnread: 'Билдирмелер, окула электери: {n}',
    messages: 'Билдирүүлөр',
    saved: 'Сакталгандар',
    menu: 'Меню',
    profile: 'Профиль',
    nav: 'Негизги навигация',
  },
  footer: {
    tagline: 'Кыргызстандагы кыймылсыз мүлк адистеринин портфолиосу жана чынчыл репутациясы.',
    forClients: 'Кардарларга',
    forSpecialists: 'Адистерге',
    atelier: 'Ателье',
    projects: 'Долбоорлор',
    specialists: 'Адистер',
    createBrief: 'Бриф түзүү',
    howToChoose: 'Кантип тандоо керек',
    placePortfolio: 'Портфолио жайгаштыруу',
    pricing: 'Тарифтер',
    publishingRules: 'Жарыялоо эрежелери',
    verification: 'Верификация',
    about: 'Платформа жөнүндө',
    terms: 'Оферта',
    privacy: 'Купуялык',
    support: 'Колдоо',
    copyright: '© 2026 Ателье · Бишкек',
  },
  login: {
    title: 'Кирүү же катталуу',
    codeTitle: 'Telegram’дагы код',
    subtitle: 'Бир номер — кардарлар үчүн да, адистер үчүн да.',
    phoneLabel: 'Телефон номери',
    getCode: 'Код алуу',
    codeHint: 'Код Telegram’га келет',
    sentTo: '{phone} номерине жөнөттүк.',
    changeNumber: 'Номерди өзгөртүү',
    devCode: 'Dev-режим: сиздин код {code}',
    codeLabel: 'Ырастоо коду',
    signIn: 'Кирүү',
    resendIn: 'Келген жокпу? {n} сек. кийин кайра жөнөтөбүз',
    resend: 'Кайра жөнөтүү',
    legalPrefix: 'Улантуу менен сиз',
    legalTerms: 'тейлөө шарттарын',
    legalAnd: 'жана',
    legalPrivacy: 'купуялык саясатын',
    legalSuffix: 'кабыл аласыз',
  },
  home: {
    title: 'Чыныгы долбоорлор. Текшерилген адистер.',
    subtitle:
      'Кыргызстандын интерьерлери, архитектурасы жана риелтор бүтүмдөрү — сын-пикирлер аякталган буйрутмалар боюнча гана.',
    filters: 'Фильтрлер',
    all: 'Баары',
    deals: 'Риелтор бүтүмдөрү',
    projects: 'Долбоорлор',
    confirmedOnly: 'Кардар ырастаган',
    emptyTitle: 'Азырынча бош',
    emptyDesc:
      'Бул фильтр боюнча эч нерсе табылган жок. Бардык долбоорлорду караңыз — же мындай кейсти биринчи болуп жарыялаңыз.',
    feed: 'Долбоорлор тасмасы',
  },
  catalog: {
    title: 'Адистер',
    subtitle:
      'Чыныгы иштер жана сын-пикирлер боюнча тандаңыз — алар аякталган буйрутмалар боюнча гана калтырылат.',
    resultsFor: '«{q}» боюнча жыйынтыктар',
    reset: 'тазалоо',
    all: 'Баары',
    realtors: 'Риелторлор',
    interior: 'Интерьер дизайны',
    architecture: 'Архитектура',
    landscape: 'Ландшафт',
    staging: 'Хоумстейджинг',
    viz3d: '3D',
    photo: 'Фото',
    district: 'Район:',
    filters: 'Фильтрлер',
    list: 'Адистер тизмеси',
    emptyTitle: 'Эч ким табылган жок',
    emptyDesc: 'Фильтрлерди алып салып же суроону өзгөртүп көрүңүз — каталогдо адистер андан көп.',
  },
}

const en: Dict = {
  header: {
    projects: 'Projects',
    specialists: 'Specialists',
    briefs: 'Briefs',
    searchPlaceholder: 'Specialist, district or style…',
    login: 'Sign in',
    imSpecialist: 'I’m a specialist',
    city: 'Bishkek',
    search: 'Search',
    moderation: 'Moderation',
    notifications: 'Notifications',
    notificationsUnread: 'Notifications, {n} unread',
    messages: 'Messages',
    saved: 'Saved',
    menu: 'Menu',
    profile: 'Profile',
    nav: 'Main navigation',
  },
  footer: {
    tagline: 'Portfolios and honest reputation of Kyrgyzstan’s real-estate specialists.',
    forClients: 'For clients',
    forSpecialists: 'For specialists',
    atelier: 'Atelier',
    projects: 'Projects',
    specialists: 'Specialists',
    createBrief: 'Post a brief',
    howToChoose: 'How to choose',
    placePortfolio: 'Publish portfolio',
    pricing: 'Pricing',
    publishingRules: 'Publishing rules',
    verification: 'Verification',
    about: 'About',
    terms: 'Terms',
    privacy: 'Privacy',
    support: 'Support',
    copyright: '© 2026 Atelier · Bishkek',
  },
  login: {
    title: 'Sign in or sign up',
    codeTitle: 'Code from Telegram',
    subtitle: 'One number — for clients and specialists alike.',
    phoneLabel: 'Phone number',
    getCode: 'Get the code',
    codeHint: 'The code arrives in Telegram',
    sentTo: 'Sent to {phone}.',
    changeNumber: 'Change number',
    devCode: 'Dev mode: your code is {code}',
    codeLabel: 'Verification code',
    signIn: 'Sign in',
    resendIn: 'Nothing yet? We can resend in {n} sec',
    resend: 'Send again',
    legalPrefix: 'By continuing you accept the',
    legalTerms: 'terms of service',
    legalAnd: 'and the',
    legalPrivacy: 'privacy policy',
    legalSuffix: '',
  },
  home: {
    title: 'Real projects. Verified specialists.',
    subtitle:
      'Interiors, architecture and realtor deals across Kyrgyzstan — with reviews left only on completed orders.',
    filters: 'Filters',
    all: 'All',
    deals: 'Realtor deals',
    projects: 'Projects',
    confirmedOnly: 'Client-confirmed',
    emptyTitle: 'Nothing here yet',
    emptyDesc:
      'No results for this filter. Browse all projects — or be the first to publish a case like this.',
    feed: 'Project feed',
  },
  catalog: {
    title: 'Specialists',
    subtitle: 'Choose by real work and reviews — they can only be left on completed orders.',
    resultsFor: 'Results for “{q}”',
    reset: 'reset',
    all: 'All',
    realtors: 'Realtors',
    interior: 'Interior design',
    architecture: 'Architecture',
    landscape: 'Landscape',
    staging: 'Home staging',
    viz3d: '3D',
    photo: 'Photo',
    district: 'District:',
    filters: 'Filters',
    list: 'Specialist list',
    emptyTitle: 'No one found',
    emptyDesc: 'Try clearing filters or changing the query — the catalog holds more than it seems.',
  },
}

export const DICTS: Record<Locale, Dict> = { ru, ky, en }

export function isLocale(v: string | undefined | null): v is Locale {
  return Boolean(v) && (LOCALES as readonly string[]).includes(v as string)
}

/** Подстановка {переменных}: fmt('через {n} сек', { n: 42 }) */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    Object.hasOwn(vars, k) ? String(vars[k]) : `{${k}}`,
  )
}
