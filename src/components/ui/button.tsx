import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/55 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-sidebar text-white shadow-sm shadow-sidebar/15 hover:bg-[var(--surface-inverse-raised)]",
        brand: "bg-brand text-[var(--on-brand)] shadow-sm shadow-brand/20 hover:bg-[var(--brand-hover)]",
        secondary: "bg-[var(--surface-muted)] text-ink hover:bg-[var(--surface-muted)]",
        outline: "border border-[var(--border-strong)] bg-panel text-ink shadow-sm hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]",
        ghost: "text-[var(--fg-body)] hover:bg-[var(--surface-muted)] hover:text-ink",
        destructive: "bg-[var(--danger-solid)] text-white hover:bg-[var(--danger-solid-hover)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
