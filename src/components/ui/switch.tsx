import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-[var(--surface-neutral-strong)] outline-none transition focus-visible:ring-2 focus-visible:ring-brand/55 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-dark", className)} {...props}>
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-panel shadow-sm transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  )
}
