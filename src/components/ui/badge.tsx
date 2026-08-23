import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", {
  variants: {
    variant: {
      default: "border-brand/30 bg-brand/12 text-[var(--brand-text)]",
      secondary: "border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--fg-body)]",
      success: "border-[var(--border-accent)]/40 bg-[var(--surface-accent)] text-[var(--brand-text)]",
      warning: "border-[var(--border-warning)]/45 bg-[var(--surface-warning)] text-[var(--warning-text)]",
      destructive: "border-[var(--border-danger)] bg-[var(--surface-danger-subtle)] text-[var(--danger-text)]",
    },
  },
  defaultVariants: { variant: "default" },
})

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
