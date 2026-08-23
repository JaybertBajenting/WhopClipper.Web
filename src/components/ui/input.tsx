import * as React from "react"
import { cn } from "@/lib/utils"

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn("h-10 w-full rounded-lg border border-[var(--border-strong)] bg-panel px-3 text-sm text-ink outline-none transition placeholder:text-[var(--fg-subtle)] focus:border-brand-dark focus:ring-3 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-[var(--surface-subtle)] disabled:text-[var(--fg-muted)]", className)}
      {...props}
    />
  )
}
