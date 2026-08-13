import * as React from "react"
import { cn } from "@/lib/utils"

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn("h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 disabled:opacity-50", className)}
      {...props}
    />
  )
}

