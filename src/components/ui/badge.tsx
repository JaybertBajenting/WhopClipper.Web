import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", {
  variants: {
    variant: {
      default: "border-amber-400/20 bg-amber-400/10 text-amber-300",
      secondary: "border-zinc-700 bg-zinc-800 text-zinc-300",
      success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
      destructive: "border-red-400/20 bg-red-400/10 text-red-300",
    },
  },
  defaultVariants: { variant: "default" },
})

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

