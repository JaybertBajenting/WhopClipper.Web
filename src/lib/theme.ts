import { create } from "zustand"

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "whopclipper.theme"
const PREFERENCES: ThemePreference[] = ["light", "dark", "system"]

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return PREFERENCES.includes(stored as ThemePreference) ? (stored as ThemePreference) : "system"
  } catch {
    // Private-mode or blocked storage should not stop the app from rendering.
    return "system"
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference
}

/** Applies the theme to <html>. Called before React mounts to avoid a light flash. */
export function applyTheme(resolved: ResolvedTheme, animate = false) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (animate) {
    root.classList.add("theme-transition")
    window.setTimeout(() => root.classList.remove("theme-transition"), 220)
  }
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
  syncWithSystem: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: readStoredPreference(),
  resolved: resolveTheme(readStoredPreference()),
  setPreference: (preference) => {
    const resolved = resolveTheme(preference)
    try { window.localStorage.setItem(STORAGE_KEY, preference) } catch { /* storage is optional */ }
    applyTheme(resolved, true)
    set({ preference, resolved })
  },
  toggle: () => get().setPreference(get().resolved === "dark" ? "light" : "dark"),
  // Only a "system" preference should follow the OS setting.
  syncWithSystem: () => {
    if (get().preference !== "system") return
    const resolved = systemTheme()
    applyTheme(resolved, true)
    set({ resolved })
  },
}))

/** Runs once from main.tsx before render so the first paint already has the right theme. */
export function initializeTheme() {
  const preference = readStoredPreference()
  applyTheme(resolveTheme(preference))
}
