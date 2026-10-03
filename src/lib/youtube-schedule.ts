import type { PublishJob, RenderedClip } from "@/lib/types"

/** States that still hold a slot. Removed, cancelled and failed attempts free theirs. */
const ACTIVE = new Set(["Queued", "Validating", "Uploading", "Processing", "Scheduled", "NeedsAttention", "Published"])

/** "Sat 26 Sep, 11:00 PM" in this machine's time zone, which is the zone the slots are set in. */
export function formatSlot(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date)
}

/** The live schedule entry for a rendered clip, matched by its plan and falling back to the file. */
export function scheduleFor(clip: RenderedClip, items: PublishJob[] = []) {
  return items.find((item) => ACTIVE.has(item.status)
    && ((clip.editPlanId && item.editPlanId === clip.editPlanId) || item.outputRelativePath === clip.relativePath.replace(/\\/g, "/")))
}

export function shortsUrl(job: PublishJob) {
  return job.externalId ? `https://youtube.com/shorts/${encodeURIComponent(job.externalId)}` : null
}

/** One line on where a scheduled clip stands. */
export function scheduleState(job: PublishJob) {
  switch (job.status) {
    case "Queued": return job.error ? job.error : `Uploads around ${formatSlot(job.uploadsAfter ?? job.createdAt)}`
    case "Validating":
    case "Uploading":
    case "Processing": return "Uploading to YouTube now"
    case "Scheduled": return "Uploaded, private until its slot"
    case "Published": return "Public on YouTube"
    case "NeedsAttention": return job.error || "Needs attention: check YouTube Studio"
    default: return job.status
  }
}

/** Reads a Google OAuth client file ("client_secret_....json") without sending it anywhere. */
export function readGoogleClientFile(text: string) {
  const parsed = JSON.parse(text) as Record<string, { client_id?: string; client_secret?: string } | undefined>
  const client = parsed.installed ?? parsed.web
  if (!client?.client_id) throw new Error("That file is not a Google OAuth client file (no client_id).")
  return { clientId: client.client_id, clientSecret: client.client_secret ?? "" }
}
