import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

export function formatDuration(seconds?: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return "—"
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

export function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date)
}

export function toPercent(value?: number | null) {
  if (value == null) return "—"
  const normalized = value <= 1 ? value * 100 : value
  return `${Math.round(normalized)}%`
}

export function formatPayout(amount?: number | null, perViews?: number | null, unit?: string | null) {
  if (amount == null) return unit?.trim() || null
  const money = `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (perViews == null) return unit?.trim() ? `${money} ${unit.trim()}` : money
  return `${money} per ${perViews.toLocaleString()} views`
}
