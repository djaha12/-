// Смоук M10: i18n ru/ky/en — cookie-локаль, словари хрома, fallback.
// Требует сервер :3000. Данные не мутирует — cleanup не нужен.
const BASE = 'http://127.0.0.1:3000'

let pass = 0, fail = 0
const check = (n, ok, got) => { console.log(`${n}:`, ok ? '✓' : `✗ (${got})`); ok ? pass++ : fail++ }
const page = async (path, locale) =>
  (await fetch(`${BASE}${path}`, locale ? { headers: { cookie: `atelier_locale=${locale}` } } : {})).text()

const main = async () => {
  // ru по умолчанию
  const ru = await page('/')
  check('1. дефолт ru: «Проекты» в шапке', ru.includes('Проекты'), 'нет')
  check('2. дефолт ru: html lang="ru"', ru.includes('<html lang="ru"'), 'нет')

  // ky
  const ky = await page('/', 'ky')
  check('3. ky: заголовок ленты', ky.includes('Чыныгы долбоорлор'), 'нет')
  check('4. ky: html lang="ky"', ky.includes('<html lang="ky"'), 'нет')
  check('5. ky: футер-тэглайн', ky.includes('чынчыл репутациясы'), 'нет')
  const kyCat = await page('/specialists', 'ky')
  check('6. ky: каталог («Адистер», фильтр «Баары»)', kyCat.includes('Адистер') && kyCat.includes('Баары'), 'нет')

  // en
  const en = await page('/', 'en')
  check('7. en: заголовок ленты', en.includes('Real projects. Verified specialists.'), 'нет')
  check('8. en: html lang="en"', en.includes('<html lang="en"'), 'нет')
  const enLogin = await page('/login', 'en')
  check('9. en: логин («Sign in or sign up»)', enLogin.includes('Sign in or sign up'), 'нет')

  // битая кука падает в ru
  const broken = await page('/', 'de"><script>')
  check('10. битая локаль → ru', broken.includes('Проекты') && broken.includes('<html lang="ru"'), 'нет')

  // переключатель отрисован в футере
  check('11. переключатель в футере (Кыргызча)', ru.includes('Кыргызча') && ru.includes('English'), 'нет')

  // M10.2: доменные строки карточек
  check('12. ky: карточка каталога («кардар ырастаган»)', kyCat.includes('кардар ырастаган'), 'нет')
  check('13. ky: бейдж сделки в ленте («күндө сатылды»)', ky.includes('күндө сатылды'), 'нет')
  const enCat = await page('/specialists', 'en')
  check('14. en: карточка каталога (client-confirmed)', enCat.includes('client-confirmed'), 'нет')
  check('15. en: бейдж сделки в ленте (Sold in)', en.includes('Sold in'), 'нет')
  check('16. ky: специализация на карточке («Интерьер дизайнери»)', kyCat.includes('Интерьер дизайнери'), 'нет')

  // M10.3: страница кейса
  const kyHome = ky
  const caseSlug = (kyHome.match(/\/case\/([a-z0-9-]+)/) || [])[1]
  if (caseSlug) {
    const kyCase = await page(`/case/${caseSlug}`, 'ky')
    check('17. ky: блок фактов кейса («Бүтүмдүн баасы» или «Аянты»)', kyCase.includes('Бүтүмдүн баасы') || kyCase.includes('Аянты'), 'нет')
    check('18. ky: CTA кейса («Табыштама жөнөтүү»)', kyCase.includes('Табыштама жөнөтүү'), 'нет')
    const enCase = await page(`/case/${caseSlug}`, 'en')
    check('19. en: страница кейса (Send a request)', enCase.includes('Send a request'), 'нет')
  } else {
    check('17. кейс для проверки найден', false, 'нет slug в ленте')
  }

  console.log(`\n${pass}/${pass + fail} проверок пройдено`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
