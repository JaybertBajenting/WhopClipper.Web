import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  AudioLines,
  BriefcaseBusiness,
  ChevronRight,
  CircleUserRound,
  Gauge,
  HardDrive,
  Menu,
  Search,
  Send,
  Settings2,
  Sparkles,
  X,
} from "lucide-react"
import { api } from "@/lib/api"
import { useUiStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { ThemeToggleButton, useSystemThemeListener } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const navItems = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/campaigns", label: "Campaigns", icon: BriefcaseBusiness },
  { to: "/library", label: "Audio library", icon: AudioLines },
  { to: "/jobs", label: "Jobs", icon: HardDrive },
  { to: "/publishing", label: "Publishing", icon: Send },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Primary navigation">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/", includeSearch: false }}
          onClick={onNavigate}
          className="group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--fg-subtle)] transition hover:bg-white/6 hover:text-white [&.active]:bg-white/10 [&.active]:font-semibold [&.active]:text-white"
        >
          <item.icon className="size-[18px] transition group-[.active]:text-brand" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}

function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen)
  return (
    <aside className={cn("flex h-full w-[248px] flex-col bg-sidebar text-white", !mobile && "fixed inset-y-0 left-0 z-30 hidden lg:flex")}>
      <div className="flex h-[76px] items-center gap-3 px-6">
        <span className="grid size-9 place-items-center rounded-xl bg-brand text-[var(--on-brand)]"><Sparkles className="size-5" /></span>
        <div><p className="text-[15px] font-black tracking-[0.08em]">WHOP CLIPPER</p><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">Local studio</p></div>
        {mobile && <button className="ml-auto rounded-lg p-2 text-[var(--fg-subtle)] hover:bg-white/10 hover:text-white" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X className="size-5" /></button>}
      </div>
      <div className="px-6 pb-3 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--fg-body)]">Workspace</div>
      <Navigation onNavigate={mobile ? () => setMobileNavOpen(false) : undefined} />
      <div className="mx-5 mt-8 rounded-2xl border border-white/8 bg-white/[0.035] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white"><span className="size-2 rounded-full bg-brand shadow-[0_0_0_4px_rgb(54_216_153/0.12)]" /> Local-first</div>
        <p className="text-[11px] leading-relaxed text-[var(--fg-muted)]">Your sources and renders stay inside your configured workspace.</p>
      </div>
      <div className="mt-auto border-t border-white/7 p-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--surface-inverse-raised)] text-brand"><CircleUserRound className="size-5" /></span>
          <div className="min-w-0"><p className="truncate text-xs font-semibold">Local user</p><p className="truncate text-[11px] text-[var(--fg-muted)]">Private workstation</p></div>
        </div>
      </div>
    </aside>
  )
}

function MobileNavigation() {
  const open = useUiStore((state) => state.mobileNavOpen)
  const setOpen = useUiStore((state) => state.setMobileNavOpen)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-[var(--scrim)]/55" aria-label="Close navigation" onClick={() => setOpen(false)} />
      <div className="relative h-full w-[min(82vw,280px)] shadow-2xl"><Sidebar mobile /></div>
    </div>
  )
}

function TopBar() {
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const health = useQuery({ queryKey: ["system", "dependencies"], queryFn: api.dependencies, retry: false, staleTime: 30_000, refetchInterval: 30_000 })
  const pageName = pathname === "/" ? "Dashboard" : navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to))?.label ?? "Campaign workspace"
  const isConnected = health.isSuccess
  return (
    <div className="sticky top-0 z-20 flex h-[68px] items-center border-b border-[var(--border-default)] bg-[var(--surface-subtle)]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <Button className="mr-2 lg:hidden" size="icon" variant="ghost" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu /></Button>
      <div className="flex min-w-0 items-center gap-2 text-sm"><span className="hidden text-[var(--fg-muted)] sm:block">Workspace</span><ChevronRight className="hidden size-3.5 text-[var(--fg-subtle)] sm:block" /><span className="truncate font-semibold text-[var(--fg-strong)]">{pageName}</span></div>
      <div className="ml-auto flex items-center gap-2">
        <TooltipProvider delayDuration={300}>
          <Tooltip><TooltipTrigger asChild><span className={cn("hidden cursor-default items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex", isConnected ? "border-[var(--border-accent)] bg-panel text-[var(--brand-text)]" : "border-[var(--border-warning)] bg-[var(--surface-warning-subtle)] text-[var(--warning-text)]")}><span className={cn("size-1.5 rounded-full", isConnected ? "bg-brand" : "bg-[var(--warning-solid)]")} />{isConnected ? "Local API connected" : "API offline"}</span></TooltipTrigger><TooltipContent>{isConnected ? "The .NET API is responding." : "Start the desktop host or backend on port 5080."}</TooltipContent></Tooltip>
        </TooltipProvider>
        <ThemeToggleButton />
        <Button size="icon" variant="ghost" aria-label="Search"><Search /></Button>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useSystemThemeListener()
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <MobileNavigation />
      <div className="min-h-screen lg:pl-[248px]">
        <TopBar />
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
