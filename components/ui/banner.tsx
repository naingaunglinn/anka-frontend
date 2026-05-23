import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const bannerVariants = cva(
  "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "bg-[var(--color-info-50)] text-[var(--color-info-700)] border-[var(--color-info-100)]",
        success:
          "bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-100)]",
        warning:
          "bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-100)]",
        error:
          "bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-100)]",
        brand:
          "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border-[var(--color-brand-100)]",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

export interface BannerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof bannerVariants> {
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  dismiss?: React.ReactNode
}

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      className,
      variant,
      icon,
      title,
      description,
      action,
      dismiss,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        data-slot="banner"
        data-variant={variant ?? "info"}
        role="status"
        className={cn(bannerVariants({ variant }), className)}
        {...props}
      >
        {icon ? (
          <div
            data-slot="banner-icon"
            className="flex shrink-0 items-start pt-0.5 [&>svg]:size-4"
          >
            {icon}
          </div>
        ) : null}
        <div data-slot="banner-body" className="flex-1 min-w-0">
          {title ? (
            <div
              data-slot="banner-title"
              className="font-medium leading-tight"
            >
              {title}
            </div>
          ) : null}
          {description ? (
            <div
              data-slot="banner-description"
              className={cn(
                "text-xs opacity-90",
                title ? "mt-1" : ""
              )}
            >
              {description}
            </div>
          ) : null}
          {children}
          {action ? (
            <div data-slot="banner-action" className="mt-2">
              {action}
            </div>
          ) : null}
        </div>
        {dismiss ? (
          <div data-slot="banner-dismiss" className="shrink-0">
            {dismiss}
          </div>
        ) : null}
      </div>
    )
  }
)
Banner.displayName = "Banner"

export { Banner, bannerVariants }
