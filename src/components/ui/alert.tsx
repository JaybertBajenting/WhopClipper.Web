import type * as React from "react"
import { cn } from "@/lib/utils"

export function Alert({ className, tone = "info", ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: "info" | "warning" | "error" | "success" }) {
  return <div role="status" className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", tone === "info" && "border-[var(--border-strong)] bg-[var(--surface-accent-subtle)] text-[var(--brand-text)]", tone === "warning" && "border-[var(--border-warning)] bg-[var(--surface-warning-subtle)] text-[var(--warning-text)]", tone === "error" && "border-[var(--border-danger)] bg-[var(--surface-danger-subtle)] text-[var(--danger-text)]", tone === "success" && "border-[var(--border-accent)] bg-[var(--surface-accent-subtle)] text-[var(--brand-text)]", className)} {...props} />
}
