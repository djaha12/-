import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-muted text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        accent: 'bg-accent-soft text-accent-soft-foreground',
        success: 'bg-success-soft text-success',
        danger: 'bg-danger-soft text-danger',
        inverse: 'bg-inverse/85 text-inverse-foreground backdrop-blur-sm',
      },
      size: {
        sm: 'px-2.5 py-0.5 text-xs',
        md: 'px-3 py-1 text-[13px]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'sm',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }
