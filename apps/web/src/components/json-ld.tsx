/** Структурированные данные schema.org. Данные приходят из нашего DTO-слоя (не из пользовательского ввода в сыром виде) — JSON.stringify экранирует строки; защита от `</script>`-разрыва — replace ниже. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
