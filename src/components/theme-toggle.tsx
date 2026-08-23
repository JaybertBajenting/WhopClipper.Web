import { useEffect } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useThemeStore, type ThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

/** Keeps a "system" preference in step with the OS while the app is open. */
export function useSystemThemeListener() {
  const syncWithSystem = useThemeStore((state) => state.syncWithSystem)
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => syncWithSystem()
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [syncWithSystem])
}

/** Compact icon button for the top bar; flips between light and dark. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const resolved = useThemeStore((state) => state.resolved)
  const toggle = useThemeStore((state) => state.toggle)
  const isDark = resolved === "dark"
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className={className} onClick={toggle}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}>
            {isDark ? <Sun /> : <Moon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isDark ? "Switch to light theme" : "Switch to dark theme"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Three-way selector for the settings page. */
export function ThemePreferenceSelector() {
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)
  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = preference === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(option.value)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-brand/55",
              active
                ? "border-brand/45 bg-[var(--surface-accent)] text-brand-dark"
                : "border-[var(--border-strong)] bg-panel text-[var(--fg-body)] hover:border-[var(--border-accent)]",
            )}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
