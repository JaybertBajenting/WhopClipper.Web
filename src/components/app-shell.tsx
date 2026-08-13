import type { ReactNode } from "react"
import { MonitorUp } from "lucide-react"
import { Link } from "react-router-dom"

export function AppShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.07),transparent_30%)]" />
      {!compact && (
        <header className="relative z-10 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-9 place-items-center rounded-xl bg-amber-400 text-zinc-950"><MonitorUp className="size-5" /></span>
              Desk Detective
            </Link>
            <span className="hidden text-sm text-zinc-500 sm:block">Who works here?</span>
          </div>
        </header>
      )}
      <main className="relative z-10">{children}</main>
    </div>
  )
}

