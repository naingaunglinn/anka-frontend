import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const chipVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full border font-medium whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-bg-subtle)] text-[var(--color-text-default)] border-[var(--color-border-default)]",
        info: "bg-[var(--color-info-50)] text-[var(--color-info-700)] border-[var(--color-info-100)]",
        success:
          "bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-100)]",
        warning:
          "bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-100)]",
        error:
          "bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-100)]",
        ai: "bg-[var(--color-ai-50)] text-[var(--color-ai-700)] border-[var(--color-ai-100)]",
        brand:
          "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border-[var(--color-brand-100)]",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        data-slot="chip"
        data-variant={variant ?? "default"}
        className={cn(chipVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Chip.displayName = "Chip"

export { Chip, chipVariants }
