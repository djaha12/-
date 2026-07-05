import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,border-color,transform] duration-150 ease-(--ease-soft) select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-foreground hover:bg-accent-hover',
        secondary:
          'border border-border-strong bg-surface text-foreground hover:border-foreground/40 hover:bg-surface-muted',
        soft: 'bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft/70',
        ghost: 'text-foreground hover:bg-surface-muted',
        danger: 'bg-danger text-danger-foreground hover:opacity-90',
      },
      size: {
        sm: 'h-9 px-4 text-[13px] [&_svg]:size-4',
        md: 'h-11 px-5 text-sm [&_svg]:size-4.5',
        lg: 'h-12 px-7 text-[15px] [&_svg]:size-5',
        icon: 'size-11 [&_svg]:size-5',
        iconSm: 'size-9 [&_svg]:size-4.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(
        buttonVariants({ variant, size }),
        // loading ≠ disabled: полная насыщенность, спиннера достаточно
        loading && 'pointer-events-none',
        className,
      )}
      aria-busy={loading || undefined}
      disabled={disabled}
      // guard и для клавиатуры: Enter/Space не дублируют сабмит при loading.
      // Оборачиваем только переданный onClick — он существует лишь в клиентской границе,
      // серверные <Button loading> не получают функцию-проп (RSC-ограничение).
      onClick={onClick && loading ? (e) => e.preventDefault() : onClick}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
