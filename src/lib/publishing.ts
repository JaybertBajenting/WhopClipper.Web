import type { AccountKitField, PublishingPlatform, PublishStatus } from "@/lib/types"

export const publishingPlatforms: PublishingPlatform[] = ["TikTok", "InstagramReels", "YouTubeShorts"]

export const publishingPlatformLabels: Record<PublishingPlatform, string> = {
  TikTok: "TikTok",
  InstagramReels: "Instagram Reels",
  YouTubeShorts: "YouTube Shorts",
}

export const publishStatusLabels: Record<PublishStatus, string> = {
  Queued: "Queued",
  Validating: "Validating",
  Uploading: "Uploading",
  Processing: "Processing",
  AwaitingFinalConfirmation: "Ready for final Instagram confirmation",
  Published: "Published",
  RequiresManualAction: "Manual upload ready",
  NeedsAttention: "Check platform before retrying",
  Failed: "Failed",
  Cancelled: "Cancelled",
  Scheduled: "Uploaded, goes public at its slot",
  Removed: "Taken off YouTube",
}

const forbiddenAccountField = /(password|passcode|2fa|mfa|totp|recovery|backup.?code|authenticator|secret)/i

/** Defense in depth: never render, copy, persist, or submit account-authentication secrets. */
export function safeAccountFields(fields: AccountKitField[]) {
  return fields.filter((field) => !forbiddenAccountField.test(field.key) && !forbiddenAccountField.test(field.label))
}

export function accountKitText(displayName: string, fields: AccountKitField[]) {
  const lines = safeAccountFields(fields)
    .filter((field) => field.copyable && field.value.trim())
    .map((field) => `${field.label}: ${field.value.trim()}`)
  return [displayName, ...lines].join("\n")
}

function secureIndex(max: number) {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure password generation is unavailable on this device.")
  const ceiling = Math.floor(0x1_0000_0000 / max) * max
  const word = new Uint32Array(1)
  do globalThis.crypto.getRandomValues(word); while (word[0] >= ceiling)
  return word[0] % max
}

function take(set: string) { return set[secureIndex(set.length)] }

/**
 * Creates an account password in memory only. Callers must copy it immediately and must never
 * put it in React state, the DOM, logs, API requests, storage, or analytics.
 */
export function generateStrongPassword(length = 24) {
  if (length < 16) throw new Error("Strong passwords must contain at least 16 characters.")
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*-_=+"]
  const all = groups.join("")
  const chars = groups.map(take)
  while (chars.length < length) chars.push(take(all))
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = secureIndex(index + 1)
    ;[chars[index], chars[swap]] = [chars[swap], chars[index]]
  }
  return chars.join("")
}

export async function copyGeneratedPassword() {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable. Enable it and try again.")
  const password = generateStrongPassword()
  await navigator.clipboard.writeText(password)
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const area = document.createElement("textarea")
  area.value = value
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  document.execCommand("copy")
  area.remove()
}
