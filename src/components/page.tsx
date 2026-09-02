import type * as React from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react"
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

/**
 * Which page numbers to draw. Long lists get an elided window rather than ninety buttons: the
 * first and last page are always reachable, plus a run around wherever the reader is.
 */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const near = [page - 1, page, page + 1].filter((value) => value > 1 && value < pageCount)
  const shown = [1, ...near, pageCount]
  const output: Array<number | "gap"> = []
  for (const value of shown) {
    const previous = output[output.length - 1]
    if (typeof previous === "number" && value - previous > 1) output.push("gap")
    output.push(value)
  }
  return output
}

/**
 * Renders nothing at all when everything fits on one page, so short lists look exactly as they did
 * before pagination existed.
 */
export function Pagination({ page, pageCount, total, from, to, onPageChange, noun = "items", className }: { page: number; pageCount: number; total: number; from: number; to: number; onPageChange: (page: number) => void; noun?: string; className?: string }) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label={`${noun} pagination`} className={cn("flex flex-col items-center justify-between gap-3 border-t border-[var(--border-default)] px-5 py-4 sm:flex-row", className)}>
      <p className="text-xs text-[var(--fg-muted)]">Showing <span className="font-semibold text-[var(--fg-body)]">{from}–{to}</span> of {total} {noun}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /> Prev</Button>
        {pageWindow(page, pageCount).map((value, index) => value === "gap"
          ? <span key={`gap-${index}`} className="px-1 text-xs text-[var(--fg-muted)]">…</span>
          : <Button key={value} variant={value === page ? "brand" : "ghost"} size="sm" className="min-w-8 px-2" aria-label={`Page ${value}`} aria-current={value === page ? "page" : undefined} onClick={() => onPageChange(value)}>{value}</Button>)}
        <Button variant="ghost" size="sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next <ChevronRight /></Button>
      </div>
    </nav>
  )
}
