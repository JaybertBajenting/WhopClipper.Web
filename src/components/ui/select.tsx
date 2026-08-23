import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-strong)] bg-panel px-3 text-sm text-ink outline-none transition focus:border-brand-dark focus:ring-3 focus:ring-brand/15 disabled:opacity-50 data-[placeholder]:text-[var(--fg-subtle)]", className)} {...props}>
      {children}
      <SelectPrimitive.Icon><ChevronDown className="size-4 text-[var(--fg-muted)]" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position={position} className={cn("z-[60] max-h-80 min-w-[8rem] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-panel p-1 shadow-xl", position === "popper" && "w-[var(--radix-select-trigger-width)]", className)} {...props}>
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-default select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-ink outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--surface-accent-subtle)]", className)} {...props}>
      <span className="absolute left-2.5"><SelectPrimitive.ItemIndicator><Check className="size-4 text-brand-dark" /></SelectPrimitive.ItemIndicator></span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
