import * as React from "react"
import { cn } from "@/lib/utils"

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn("min-h-28 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-panel px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition placeholder:text-[var(--fg-subtle)] focus:border-brand-dark focus:ring-3 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-[var(--surface-subtle)]", className)} {...props} />
}
