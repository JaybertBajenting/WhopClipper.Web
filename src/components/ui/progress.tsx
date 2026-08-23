import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"

export function Progress({ className, value = 0, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const normalizedValue = value ?? 0
  return (
    <ProgressPrimitive.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]", className)} {...props}>
      <ProgressPrimitive.Indicator className="h-full bg-brand transition-all" style={{ transform: `translateX(-${100 - normalizedValue}%)` }} />
    </ProgressPrimitive.Root>
  )
}
