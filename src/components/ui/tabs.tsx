import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex min-h-10 max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-[var(--surface-muted)] p-1 text-[var(--fg-body)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} {...props} />
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("inline-flex min-h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50 data-[state=active]:bg-panel data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:shadow-sm", className)} {...props} />
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-5 outline-none focus-visible:ring-2 focus-visible:ring-brand/50", className)} {...props} />
}
