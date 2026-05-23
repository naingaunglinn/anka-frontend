import * as React from "react"

import { cn } from "@/lib/utils"

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="empty-state"
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-12 px-6 text-center",
          className
        )}
        {...props}
      >
        {icon ? (
          <div
            data-slot="empty-state-icon"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] [&>svg]:size-6"
          >
            {icon}
          </div>
        ) : null}
        <div
          data-slot="empty-state-title"
          className="text-sm font-medium text-[var(--color-text-default)]"
        >
          {title}
        </div>
        {description ? (
          <div
            data-slot="empty-state-description"
            className="max-w-md text-xs text-[var(--color-text-muted)]"
          >
            {description}
          </div>
        ) : null}
        {action ? (
          <div data-slot="empty-state-action" className="mt-2">
            {action}
          </div>
        ) : null}
      </div>
    )
  }
)
EmptyState.displayName = "EmptyState"

export { EmptyState }
