import images from './images.json'

export type MockImage = {
  src: string
  width: number
  height: number
  blurDataURL: string
}

export function img(id: string): MockImage {
  const image = (images as Record<string, MockImage>)[id]
  if (!image) throw new Error(`Нет mock-изображения: ${id}. Запустите pnpm gen:mock`)
  return image
}

export interface DealStats {
  closed: number
  /** из них подтверждены клиентами через заказ на платформе */
  confirmed: number
  medianDaysOnMarket: number
  districts: string[]
}

export interface Specialist {
  slug: string
  name: string
  profession: string
  city: string
  verified: boolean
  rating: number
  reviewsCount: number
  projectsCount: number
  repeatClientsPct: number
  responseTime: string
  memberSince: string
  styles: string[]
  priceFrom: number // сом/м²
  priceTo: number
  acceptsOrders: boolean
  worksAt?: string
  bio: string
  /** только у риелторов */
  dealStats?: DealStats
}

export type DealType = 'sale' | 'rentOut' | 'buyAssist'

export interface DealInfo {
  type: DealType
  propertyType: string // «Вторичка», «Новостройка», «Дом», «Коммерция»
  /** цена сделки в сомах; для аренды — в месяц */
  price?: number
  /** дней от публикации до задатка; только завершённые продажи/аренда */
  daysOnMarket?: number
  /** сделка проведена через заказ на платформе и подтверждена клиентом */
  confirmed: boolean
}

export interface CaseItem {
  id: string
  slug: string
  title: string
  specialistSlug: string
  location: string
  styles: string[]
  areaM2?: number
  budgetFrom: number // сом, весь проект
  budgetTo: number
  saves: number
  imageId: string
  /** присутствует только у кейсов-сделок риелторов */
  deal?: DealInfo
}

export interface Review {
  id: string
  author: string
  date: string
  caseTitle: string
  quality: number
  timing: number
  communication: number
  budget: number
  text: string
}

export const specialists: Specialist[] = [
  {
    slug: 'aizhan-saparova',
    name: 'Айжан Сапарова',
    profession: 'Дизайнер интерьера',
    city: 'Бишкек',
    verified: true,
    rating: 4.9,
    reviewsCount: 27,
    projectsCount: 14,
    repeatClientsPct: 86,
    responseTime: '~2 часа',
    memberSince: '2024',
    styles: ['Минимализм', 'Джапанди', 'Скандинавский'],
    priceFrom: 2500,
    priceTo: 4000,
    acceptsOrders: true,
    bio: 'Проектирую жилые интерьеры, в которых легко жить: тёплый минимализм, честные материалы, продуманный свет. Веду проект от обмеров до расстановки декора — с авторским надзором и командой проверенных подрядчиков.',
  },
  { slug: 'daniyar-osmonov', name: 'Данияр Осмонов', profession: 'Архитектор', city: 'Бишкек', verified: true, rating: 4.8, reviewsCount: 19, projectsCount: 11, repeatClientsPct: 74, responseTime: '~4 часа', memberSince: '2024', styles: ['Современный', 'Органический'], priceFrom: 1800, priceTo: 3200, acceptsOrders: true, worksAt: 'Бюро «Меридиан»', bio: '' },
  { slug: 'maria-kim', name: 'Мария Ким', profession: 'Хоумстейджер', city: 'Бишкек', verified: true, rating: 4.9, reviewsCount: 31, projectsCount: 26, repeatClientsPct: 62, responseTime: '~1 час', memberSince: '2024', styles: ['Нейтральный', 'Скандинавский'], priceFrom: 300, priceTo: 700, acceptsOrders: true, bio: '' },
  { slug: 'eldar-toktogulov', name: 'Эльдар Токтогулов', profession: '3D-визуализатор', city: 'Бишкек', verified: false, rating: 4.7, reviewsCount: 12, projectsCount: 9, repeatClientsPct: 55, responseTime: '~3 часа', memberSince: '2025', styles: ['Фотореализм'], priceFrom: 800, priceTo: 1500, acceptsOrders: true, bio: '' },
  { slug: 'asel-dzhumabaeva', name: 'Асель Джумабаева', profession: 'Ландшафтный дизайнер', city: 'Бишкек', verified: true, rating: 4.8, reviewsCount: 15, projectsCount: 12, repeatClientsPct: 70, responseTime: '~5 часов', memberSince: '2024', styles: ['Природный', 'Средиземноморский'], priceFrom: 900, priceTo: 2000, acceptsOrders: false, bio: '' },
  { slug: 'viktor-li', name: 'Виктор Ли', profession: 'Фотограф недвижимости', city: 'Бишкек', verified: true, rating: 5.0, reviewsCount: 44, projectsCount: 58, repeatClientsPct: 81, responseTime: '~30 минут', memberSince: '2024', styles: ['Интерьерная съёмка'], priceFrom: 4000, priceTo: 12000, acceptsOrders: true, bio: '' },
  { slug: 'zhyldyz-mambetova', name: 'Жылдыз Мамбетова', profession: 'Декоратор', city: 'Бишкек', verified: false, rating: 4.6, reviewsCount: 8, projectsCount: 7, repeatClientsPct: 50, responseTime: '~6 часов', memberSince: '2025', styles: ['Эклектика', 'Бохо'], priceFrom: 500, priceTo: 1200, acceptsOrders: true, bio: '' },
  { slug: 'timur-sadykov', name: 'Тимур Садыков', profession: 'Дизайнер интерьера', city: 'Бишкек', verified: true, rating: 4.7, reviewsCount: 21, projectsCount: 16, repeatClientsPct: 68, responseTime: '~2 часа', memberSince: '2024', styles: ['Лофт', 'Индастриал'], priceFrom: 2000, priceTo: 3500, acceptsOrders: true, bio: '' },
  { slug: 'cholpon-imanova', name: 'Чолпон Иманова', profession: 'Дизайнер интерьера', city: 'Ош', verified: true, rating: 4.8, reviewsCount: 13, projectsCount: 10, repeatClientsPct: 77, responseTime: '~3 часа', memberSince: '2025', styles: ['Классика', 'Неоклассика'], priceFrom: 1500, priceTo: 2800, acceptsOrders: true, bio: '' },
  { slug: 'aleksey-kovalev', name: 'Алексей Ковалёв', profession: 'Архитектор', city: 'Бишкек', verified: false, rating: 4.5, reviewsCount: 6, projectsCount: 5, repeatClientsPct: 40, responseTime: '~8 часов', memberSince: '2025', styles: ['Модернизм'], priceFrom: 1600, priceTo: 3000, acceptsOrders: true, bio: '' },
  { slug: 'aigerim-bekova', name: 'Айгерим Бекова', profession: 'Дизайнер интерьера', city: 'Бишкек', verified: true, rating: 4.9, reviewsCount: 24, projectsCount: 18, repeatClientsPct: 79, responseTime: '~1 час', memberSince: '2024', styles: ['Контемпорари', 'Тёплый минимализм'], priceFrom: 2800, priceTo: 4500, acceptsOrders: true, bio: '' },
  {
    slug: 'nurlan-abdykadyrov',
    name: 'Нурлан Абдыкадыров',
    profession: 'Риелтор',
    city: 'Бишкек',
    verified: true,
    rating: 4.8,
    // инвариант честной арифметики: отзывы ≤ подтверждённых сделок (21)
    reviewsCount: 19,
    projectsCount: 47,
    repeatClientsPct: 64,
    responseTime: '~20 минут',
    memberSince: '2024',
    styles: ['Вторичка', 'Новостройки', 'Аренда'],
    priceFrom: 0,
    priceTo: 0,
    acceptsOrders: true,
    worksAt: 'АН «Ордо»',
    bio: 'Продаю квартиры в Бишкеке 9 лет: вторичка и новостройки в центре, Джале и на Магистрали. Перед продажей готовлю объект с командой — хоумстейджинг и профессиональная съёмка сокращают срок продажи в среднем вдвое. Все сделки веду через Ателье: история и отзывы — в профиле, ничего на словах.',
    dealStats: { closed: 47, confirmed: 21, medianDaysOnMarket: 24, districts: ['Центр', 'Джал', 'Магистраль'] },
  },
]

export const cases: CaseItem[] = [
  { id: 'c01', slug: 'loft-dzhal-72', title: 'Лофт для молодой пары в Джале', specialistSlug: 'aizhan-saparova', location: 'Бишкек, Джал', styles: ['Лофт', 'Тёплый минимализм'], areaM2: 72, budgetFrom: 950000, budgetTo: 1200000, saves: 214, imageId: 'c01' },
  { id: 'c02', slug: 'minimalizm-magistral', title: 'Тёплый минимализм на Магистрали', specialistSlug: 'aigerim-bekova', location: 'Бишкек, Магистраль', styles: ['Минимализм'], areaM2: 96, budgetFrom: 1400000, budgetTo: 1800000, saves: 187, imageId: 'c02' },
  { id: 'c03', slug: 'penthouse-center', title: 'Пентхаус с видом на горы', specialistSlug: 'timur-sadykov', location: 'Бишкек, центр', styles: ['Контемпорари'], areaM2: 148, budgetFrom: 3200000, budgetTo: 4000000, saves: 342, imageId: 'c03' },
  { id: 'c04', slug: 'kitchen-asanbay', title: 'Реконструкция кухни, Асанбай', specialistSlug: 'aizhan-saparova', location: 'Бишкек, Асанбай', styles: ['Джапанди'], areaM2: 18, budgetFrom: 380000, budgetTo: 450000, saves: 96, imageId: 'c04' },
  { id: 'c05', slug: 'terrace-koy-tash', title: 'Двор с террасой и очагом', specialistSlug: 'asel-dzhumabaeva', location: 'Кой-Таш', styles: ['Природный'], areaM2: 420, budgetFrom: 1100000, budgetTo: 1600000, saves: 158, imageId: 'c05' },
  { id: 'c06', slug: 'scandi-kok-zhar', title: 'Скандинавская двушка, Кок-Жар', specialistSlug: 'aizhan-saparova', location: 'Бишкек, Кок-Жар', styles: ['Скандинавский'], areaM2: 58, budgetFrom: 720000, budgetTo: 900000, saves: 129, imageId: 'c06' },
  { id: 'c07', slug: 'facade-archa-beshik', title: 'Фасад частного дома', specialistSlug: 'daniyar-osmonov', location: 'Бишкек, Арча-Бешик', styles: ['Современный'], areaM2: 210, budgetFrom: 2500000, budgetTo: 3400000, saves: 88, imageId: 'c07' },
  { id: 'c08', slug: 'render-asman', title: '3D-визуализация ЖК «Асман»', specialistSlug: 'eldar-toktogulov', location: 'Бишкек', styles: ['Фотореализм'], budgetFrom: 90000, budgetTo: 140000, saves: 73, imageId: 'c08' },
  { id: 'c09', slug: 'staging-tunguch', title: 'Хоумстейджинг перед продажей', specialistSlug: 'maria-kim', location: 'Бишкек, Тунгуч', styles: ['Нейтральный'], areaM2: 64, budgetFrom: 120000, budgetTo: 180000, saves: 112, imageId: 'c09' },
  { id: 'c10', slug: 'library-wall', title: 'Гостиная с библиотечной стеной', specialistSlug: 'aigerim-bekova', location: 'Бишкек, центр', styles: ['Контемпорари'], areaM2: 42, budgetFrom: 850000, budgetTo: 1000000, saves: 231, imageId: 'c10' },
  { id: 'c11', slug: 'garden-issyk-kul', title: 'Сад камней у Иссык-Куля', specialistSlug: 'asel-dzhumabaeva', location: 'Чолпон-Ата', styles: ['Природный'], areaM2: 800, budgetFrom: 1900000, budgetTo: 2600000, saves: 176, imageId: 'c11' },
  { id: 'c12', slug: 'studio-38', title: 'Студия 38 м² для аренды', specialistSlug: 'timur-sadykov', location: 'Бишкек, Аламедин-1', styles: ['Лофт'], areaM2: 38, budgetFrom: 420000, budgetTo: 520000, saves: 64, imageId: 'c12' },
  { id: 'c13', slug: 'office-japandi', title: 'Офис бюро в стиле джапанди', specialistSlug: 'aizhan-saparova', location: 'Бишкек, центр', styles: ['Джапанди'], areaM2: 120, budgetFrom: 1600000, budgetTo: 2100000, saves: 143, imageId: 'c13' },
  { id: 'c14', slug: 'bathroom-travertine', title: 'Ванная в травертине', specialistSlug: 'aigerim-bekova', location: 'Бишкек, Джал', styles: ['Минимализм'], areaM2: 9, budgetFrom: 300000, budgetTo: 380000, saves: 205, imageId: 'c14' },
  { id: 'c15', slug: 'mansard-dzhal', title: 'Мансарда с кабинетом', specialistSlug: 'timur-sadykov', location: 'Бишкек, Джал', styles: ['Индастриал'], areaM2: 47, budgetFrom: 560000, budgetTo: 700000, saves: 91, imageId: 'c15' },
  { id: 'c16', slug: 'kidsroom-alamedin', title: 'Детская для двоих', specialistSlug: 'zhyldyz-mambetova', location: 'Бишкек, Аламедин-1', styles: ['Скандинавский'], areaM2: 16, budgetFrom: 240000, budgetTo: 310000, saves: 84, imageId: 'c16' },
  { id: 'c17', slug: 'guesthouse-cholpon-ata', title: 'Гостевой дом, Чолпон-Ата', specialistSlug: 'daniyar-osmonov', location: 'Чолпон-Ата', styles: ['Органический'], areaM2: 180, budgetFrom: 4200000, budgetTo: 5600000, saves: 267, imageId: 'c17' },
  { id: 'c18', slug: 'photoshoot-bars', title: 'Интерьерная съёмка ЖК «Барс»', specialistSlug: 'viktor-li', location: 'Бишкек, Магистраль', styles: ['Интерьерная съёмка'], budgetFrom: 25000, budgetTo: 40000, saves: 58, imageId: 'c18' },
  { id: 'c19', slug: 'coffeeshop-kievskaya', title: 'Кофейня на Киевской', specialistSlug: 'aigerim-bekova', location: 'Бишкек, центр', styles: ['Контемпорари'], areaM2: 85, budgetFrom: 2100000, budgetTo: 2700000, saves: 198, imageId: 'c19' },
  { id: 'c20', slug: 'bedroom-mossovet', title: 'Спальня в тёплых тонах', specialistSlug: 'aizhan-saparova', location: 'Бишкек, Моссовет', styles: ['Тёплый минимализм'], areaM2: 21, budgetFrom: 350000, budgetTo: 430000, saves: 173, imageId: 'c20' },
  { id: 'c21', slug: 'landscape-kara-zhygach', title: 'Ландшафт двора таунхауса', specialistSlug: 'asel-dzhumabaeva', location: 'Бишкек, Кара-Жыгач', styles: ['Средиземноморский'], areaM2: 260, budgetFrom: 780000, budgetTo: 990000, saves: 67, imageId: 'c21' },
  { id: 'c22', slug: 'cabinet-vefa', title: 'Кабинет руководителя, БЦ «Вефа»', specialistSlug: 'timur-sadykov', location: 'Бишкек, центр', styles: ['Индастриал'], areaM2: 34, budgetFrom: 640000, budgetTo: 800000, saves: 49, imageId: 'c22' },
  { id: 'c23', slug: 'rental-osh-45', title: 'Квартира под сдачу 45 м²', specialistSlug: 'cholpon-imanova', location: 'Ош', styles: ['Неоклассика'], areaM2: 45, budgetFrom: 500000, budgetTo: 620000, saves: 77, imageId: 'c23' },
  { id: 'c24', slug: 'terrace-bosteri', title: 'Терраса с панорамой озера', specialistSlug: 'daniyar-osmonov', location: 'Бостери', styles: ['Органический'], areaM2: 60, budgetFrom: 900000, budgetTo: 1250000, saves: 154, imageId: 'c24' },
  // сделки риелтора — история, не объявления
  { id: 'd01', slug: 'dvushka-toktogula', title: 'Двушка на Токтогула, 58 м²', specialistSlug: 'nurlan-abdykadyrov', location: 'Бишкек, центр', styles: [], areaM2: 58, budgetFrom: 0, budgetTo: 0, saves: 87, imageId: 'd01', deal: { type: 'sale', propertyType: 'Вторичка', price: 4650000, daysOnMarket: 18, confirmed: true } },
  { id: 'd02', slug: 'treshka-dzhal-remont', title: 'Трёшка в Джале с ремонтом', specialistSlug: 'nurlan-abdykadyrov', location: 'Бишкек, Джал', styles: [], areaM2: 82, budgetFrom: 0, budgetTo: 0, saves: 64, imageId: 'd02', deal: { type: 'sale', propertyType: 'Вторичка', price: 6200000, daysOnMarket: 31, confirmed: true } },
  { id: 'd03', slug: 'dom-koy-tash', title: 'Дом в Кой-Таше, 210 м²', specialistSlug: 'nurlan-abdykadyrov', location: 'Кой-Таш', styles: [], areaM2: 210, budgetFrom: 0, budgetTo: 0, saves: 112, imageId: 'd03', deal: { type: 'sale', propertyType: 'Дом', price: 14500000, daysOnMarket: 47, confirmed: false } },
  { id: 'd04', slug: 'arenda-ofis-manasa', title: 'Офис на Манаса, 85 м²', specialistSlug: 'nurlan-abdykadyrov', location: 'Бишкек, центр', styles: [], areaM2: 85, budgetFrom: 0, budgetTo: 0, saves: 29, imageId: 'd04', deal: { type: 'rentOut', propertyType: 'Коммерция', price: 85000, daysOnMarket: 9, confirmed: true } },
  { id: 'd05', slug: 'podbor-studiya-asman', title: 'Студия в ЖК «Асман» под сдачу', specialistSlug: 'nurlan-abdykadyrov', location: 'Бишкек, Магистраль', styles: [], areaM2: 38, budgetFrom: 0, budgetTo: 0, saves: 41, imageId: 'd05', deal: { type: 'buyAssist', propertyType: 'Новостройка', confirmed: true } },
  { id: 'd06', slug: 'kvartira-magistral-ipoteka', title: 'Квартира на Магистрали под ипотеку', specialistSlug: 'nurlan-abdykadyrov', location: 'Бишкек, Магистраль', styles: [], areaM2: 64, budgetFrom: 0, budgetTo: 0, saves: 33, imageId: 'd06', deal: { type: 'sale', propertyType: 'Вторичка', price: 5100000, daysOnMarket: 26, confirmed: false } },
]

/** порядок ленты: риелторские сделки видны с первого экрана (приоритетная вертикаль) */
export const feedCases: CaseItem[] = [
  cases[0]!, // лофт
  cases.find((c) => c.id === 'd01')!,
  cases[1]!,
  cases[2]!,
  cases.find((c) => c.id === 'd04')!,
  cases[3]!,
  cases[4]!,
  cases.find((c) => c.id === 'd02')!,
  cases[5]!,
  cases[6]!,
  cases[7]!,
  cases.find((c) => c.id === 'd03')!,
  ...cases.slice(8, 24),
]

export const reviews: Review[] = [
  {
    id: 'r1',
    author: 'Салтанат Э.',
    date: 'май 2026',
    caseTitle: 'Лофт для молодой пары в Джале',
    quality: 5,
    timing: 5,
    communication: 5,
    budget: 4,
    text: 'Айжан услышала нас с первого разговора. Смета была прозрачной, чек-поинты с фото каждую неделю — мы жили в другом городе и всё равно всё видели. Единственное — итог вышел на 6% выше вилки, но это было согласовано заранее.',
  },
  {
    id: 'r2',
    author: 'Руслан Т.',
    date: 'март 2026',
    caseTitle: 'Реконструкция кухни, Асанбай',
    quality: 5,
    timing: 4,
    communication: 5,
    budget: 5,
    text: 'Кухню сдали на неделю позже из-за поставки столешницы, но нас предупредили заранее и предложили решение. Результат лучше визуализации. Уже обсуждаем следующий проект — спальню.',
  },
  {
    id: 'r3',
    author: 'Динара К.',
    date: 'январь 2026',
    caseTitle: 'Скандинавская двушка, Кок-Жар',
    quality: 5,
    timing: 5,
    communication: 4,
    budget: 5,
    text: 'Уложились в бюджет до сома. Все материалы — местные поставщики, ничего не ждали месяцами. Отвечала иногда не сразу, но по делу и всегда с вариантами.',
  },
]

export const dealReviews: Review[] = [
  {
    id: 'dr1',
    author: 'Гульмира А.',
    date: 'июнь 2026',
    caseTitle: 'Двушка на Токтогула, 58 м²',
    quality: 5,
    timing: 5,
    communication: 5,
    budget: 5,
    text: 'Квартира висела на house.kg четыре месяца без единого звонка. Нурлан привёл стейджера и фотографа, переупаковал объявление — задаток взяли на 18-й день, по цене даже выше, чем я рассчитывала. Все этапы видела в заказе: показы, звонки, торг.',
  },
  {
    id: 'dr2',
    author: 'Бакыт Ж.',
    date: 'апрель 2026',
    caseTitle: 'Офис на Манаса, 85 м²',
    quality: 5,
    timing: 5,
    communication: 4,
    budget: 5,
    text: 'Сдали офис за 9 дней, арендатор — сетевой бизнес с договором на 3 года. Понравилось, что все условия и статусы фиксировались на платформе, а не в переписке.',
  },
  {
    id: 'dr3',
    author: 'Айгуль С.',
    date: 'февраль 2026',
    caseTitle: 'Подбор: студия в ЖК «Асман»',
    quality: 5,
    timing: 4,
    communication: 5,
    budget: 5,
    text: 'Искали студию под сдачу. Нурлан отговорил от двух «выгодных» вариантов, объяснив риски застройщика, и нашёл вариант с лучшей арендной ставкой. Честность дороже скорости.',
  },
]

export function findSpecialist(slug: string): Specialist | undefined {
  return specialists.find((x) => x.slug === slug)
}

/** строгая версия для внутренних ссылок (карточки), где slug гарантирован данными */
export function specialistBySlug(slug: string): Specialist {
  const s = findSpecialist(slug)
  if (!s) throw new Error(`Нет специалиста: ${slug}`)
  return s
}

export function casesOf(slug: string): CaseItem[] {
  return cases.filter((c) => c.specialistSlug === slug)
}

export function findCase(slug: string): CaseItem | undefined {
  return cases.find((x) => x.slug === slug)
}
