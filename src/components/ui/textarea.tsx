import * as React from "react"
import { cn } from "@/lib/utils"

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn("min-h-28 w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20", className)} {...props} />
}

