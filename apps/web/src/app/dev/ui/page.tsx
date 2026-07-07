import { notFound } from 'next/navigation'
import { FolderPlus, Search } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/empty-state'
import { RatingStars } from '@/components/rating-stars'
import { SaveButton } from '@/components/save-button'
import { VerifiedBadge } from '@/components/verified-badge'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-8">
      <h2 className="mb-5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

const SWATCHES = [
  ['background', 'bg-background border border-border'],
  ['surface', 'bg-surface border border-border'],
  ['surface-muted', 'bg-surface-muted'],
  ['foreground', 'bg-foreground'],
  ['muted-foreground', 'bg-muted-foreground'],
  ['accent', 'bg-accent'],
  ['accent-soft', 'bg-accent-soft'],
  ['success', 'bg-success'],
  ['danger', 'bg-danger'],
  ['warning', 'bg-warning'],
] as const

export default function DevUiPage() {
  // витрина дизайн-системы — только вне прода
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <h1 className="pt-10 font-display text-4xl font-semibold tracking-tight">
          Дизайн-система
        </h1>
        <p className="mt-2 text-muted-foreground">
          Токены и состояния компонентов. Не для продакшена — /dev/ui.
        </p>

        <Section title="Палитра">
          <div className="flex flex-wrap gap-3">
            {SWATCHES.map(([name, cls]) => (
              <figure key={name} className="w-24">
                <div className={`h-14 rounded-lg ${cls}`} />
                <figcaption className="mt-1.5 text-xs text-muted-foreground">{name}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section title="Типографика">
          <div className="space-y-3">
            <p className="font-display text-5xl font-semibold tracking-tight">Дисплей / Lora 48</p>
            <p className="font-display text-3xl font-semibold tracking-tight">Заголовок H2 / 30</p>
            <p className="text-xl font-semibold">Подзаголовок / Manrope 20</p>
            <p className="text-base">Основной текст 16 — «Кыргызстан», ёж и типографика.</p>
            <p className="text-sm text-muted-foreground">Второстепенный 14</p>
            <p className="text-xs text-faint-foreground">Подпись 12</p>
          </div>
        </Section>

        <Section title="Кнопки">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg">Large</Button>
              <Button size="sm">Small</Button>
              <Button loading>Сохраняем…</Button>
              <Button disabled>Disabled</Button>
              <Button size="icon" aria-label="Поиск">
                <Search />
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Бейджи и рейтинг">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Минимализм</Badge>
            <Badge variant="outline">от 2 500 сом/м²</Badge>
            <Badge variant="accent">Продвижение</Badge>
            <Badge variant="success">Заказ выполнен</Badge>
            <Badge variant="danger">Отклонено</Badge>
            <RatingStars value={4} />
            <VerifiedBadge label="Верифицирован" />
            <SaveButton />
          </div>
        </Section>

        <Section title="Поля ввода">
          <div className="grid max-w-md gap-3">
            <Input placeholder="Стиль, специалист или район…" />
            <Input defaultValue="+996 555 123 456" />
            <Input aria-invalid placeholder="С ошибкой" />
            <Input disabled placeholder="Недоступно" />
          </div>
        </Section>

        <Section title="Вкладки">
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">Кейсы</TabsTrigger>
              <TabsTrigger value="b">Отзывы</TabsTrigger>
              <TabsTrigger value="c">О себе</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="text-sm text-muted-foreground">
              Содержимое вкладки.
            </TabsContent>
          </Tabs>
        </Section>

        <Section title="Загрузка (skeleton)">
          <div className="flex max-w-md items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          </div>
        </Section>

        <Section title="Пустое состояние">
          <EmptyState
            icon={FolderPlus}
            title="Пока нет кейсов"
            description="Опубликуйте первый проект за 5 минут — фото можно загрузить прямо с телефона."
            actionLabel="Добавить кейс"
          />
        </Section>

        <Section title="Аватары">
          <div className="flex items-center gap-3">
            <Avatar name="Айжан Сапарова" />
            <Avatar name="Данияр Осмонов" />
            <Avatar name="Мария Ким" />
            <Avatar name="Эльдар Токтогулов" className="size-14 text-lg" />
          </div>
        </Section>
      </main>
    </>
  )
}
