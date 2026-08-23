import type * as React from "react"
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand-dark">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-ink md:text-[2rem]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--fg-body)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function LoadingPage({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-label="Loading" aria-busy="true">
      <div className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-80 max-w-full" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: cards }, (_, index) => <Skeleton className="h-36" key={index} />)}</div>
      <Skeleton className="h-80" />
    </div>
  )
}

export function ErrorState({ title = "Couldn’t load this view", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-panel px-6 py-12 text-center">
      <span className="mb-4 rounded-2xl bg-[var(--surface-danger-subtle)] p-3 text-[var(--danger-text)]"><AlertTriangle className="size-6" /></span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--fg-body)]">{message}</p>
      {onRetry && <Button variant="outline" className="mt-5" onClick={onRetry}><RefreshCw /> Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] px-6 py-10 text-center">
      <span className="mb-4 rounded-2xl bg-[var(--surface-accent-subtle)] p-3 text-brand-dark">{icon ?? <Inbox className="size-6" />}</span>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--fg-body)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--danger-text)]">{children}</p>
}
