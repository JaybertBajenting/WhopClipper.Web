import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CalendarClock, CarFront, Check, Clapperboard, Cloud, CloudDownload, CloudUpload, Copy, Download, ExternalLink, Film, FolderOpen, Music, Play, RefreshCw, SlidersHorizontal, SquarePlay, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage } from "@/lib/api"
import { describeClipStyle } from "@/lib/edit-style"
import type { CampaignEditStyle, Job, PublishJob, RenderedClip, YouTubeSchedule } from "@/lib/types"
import { formatSlot, formatSlotShort, scheduleFor, scheduleState, shortsUrl } from "@/lib/youtube-schedule"
import { scheduleQueryKey, TakeOffButton, useYouTubeSchedule, YouTubePagePicker } from "@/components/publishing/youtube-schedule-panel"
import { usePagination } from "@/lib/pagination"
import { formatBytes, formatDate, formatDay } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, Pagination } from "@/components/page"
import { BrollEditor } from "./broll-editor"

// Each tile mounts a <video preload="metadata">, so the page size is the number of simultaneous
// requests this card fires at the local API. The heavy player only mounts for the open clip.
const CLIPS_PER_PAGE = 12

/** Which clips the YouTube switch keeps: all of them, those public or scheduled, or those not posted yet. */
type YouTubeFilter = "all" | "on" | "off"

const platformLabels: Record<string, string> = {
  tiktok: "TikTok",
  "instagram-reels": "Instagram Reels",
  instagramreels: "Instagram Reels",
  "youtube-shorts": "YouTube Shorts",
  youtubeshorts: "YouTube Shorts",
  x: "X",
}

const stamp = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`
const pct = (value: number) => `${Math.round(value * 100)}%`

function clipLength(clip: RenderedClip) {
  if (clip.startSeconds == null || clip.endSeconds == null) return null
  return stamp(clip.endSeconds - clip.startSeconds)
}

function clipRange(clip: RenderedClip) {
  if (clip.startSeconds == null || clip.endSeconds == null) return null
  return `${stamp(clip.startSeconds)}–${stamp(clip.endSeconds)} of source`
}

const isTerminal = (status?: string) => status === "Completed" || status === "Failed" || status === "Cancelled"

/** Clipboard with a visible result: copying silently gives no way to tell it worked. */
function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { toast.error("Could not copy. Select the text and copy it manually.") }
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">{label}</p>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="text-brand-dark" /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {multiline
        ? <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-subtle)] p-2.5 font-sans text-xs leading-relaxed text-[var(--fg-strong)]">{value}</pre>
        : <p className="rounded-lg bg-[var(--surface-subtle)] p-2.5 text-xs font-semibold leading-snug text-ink">{value}</p>}
    </div>
  )
}

/** Podcast-split clips only: the footage that went underneath, and any moment nothing usable came back for. */
function ClipFootage({ clip }: { clip: RenderedClip }) {
  const described = describeClipStyle(clip.style)
  if (!described || !clip.style) return null
  return (
    <details className="rounded-lg bg-[var(--surface-subtle)] p-2.5 text-xs">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold text-[var(--fg-strong)]">
        <Film className="size-3.5" /> {described.summary}
        {described.gapCount > 0 && <Badge variant="warning">Incomplete B-roll</Badge>}
      </summary>
      <ul className="mt-2 space-y-1 text-[var(--fg-muted)]">
        {clip.style.footage.map((item, index) => (
          <li key={`${item.url ?? item.query}-${index}`} className="truncate">
            {item.url
              ? <a href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item.title || item.query}</a>
              : item.title || item.query}
          </li>
        ))}
        {clip.style.gaps.map((gap) => (
          <li key={`gap-${gap.atSeconds}`}>Missing footage at {gap.atSeconds.toFixed(1)}-{(gap.atSeconds + gap.durationSeconds).toFixed(1)}s for {gap.query}: {gap.reason}</li>
        ))}
      </ul>
    </details>
  )
}

/**
 * The levels every new clip starts from. It lives here, beside the clips, because this is where you
 * hear that the balance is wrong. It used to sit on the Requirements tab, which is not where anyone
 * looking at a finished clip thinks to go.
 */
function DefaultVolumes({ campaignId, editStyle }: { campaignId: string; editStyle?: CampaignEditStyle | null }) {
  const queryClient = useQueryClient()
  const savedVoice = editStyle?.voiceVolume ?? 1
  const savedMusic = editStyle?.musicVolume ?? 0.2
  const [voice, setVoice] = useState(savedVoice)
  const [music, setMusic] = useState(savedMusic)
  const [synced, setSynced] = useState(`${savedVoice}/${savedMusic}`)
  if (synced !== `${savedVoice}/${savedMusic}`) {
    setSynced(`${savedVoice}/${savedMusic}`)
    setVoice(savedVoice)
    setMusic(savedMusic)
  }
  const dirty = voice !== savedVoice || music !== savedMusic
  const save = useMutation({
    mutationFn: () => api.updateCampaignEditStyle(campaignId,
      { ...(editStyle as CampaignEditStyle), voiceVolume: voice, musicVolume: music }),
    onSuccess: () => {
      toast.success("Saved. Every clip rendered from now on starts at these levels.")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  if (!editStyle) return null
  return (
    <details className="mb-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-xs font-semibold text-[var(--fg-strong)]">
        <SlidersHorizontal className="size-3.5" /> Default levels for all clips
        <span className="font-normal text-[var(--fg-muted)]">voice {pct(savedVoice)} · music {pct(savedMusic)}</span>
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor="default-voice">
            <span>Podcast voice</span><span className="tabular-nums">{pct(voice)}</span>
          </label>
          <input id="default-voice" type="range" min={50} max={200} value={Math.round(voice * 100)} className="w-full"
            onChange={(event) => setVoice(Number(event.target.value) / 100)} />
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor="default-music">
            <span>Music</span><span className="tabular-nums">{pct(music)}</span>
          </label>
          <input id="default-music" type="range" min={0} max={60} value={Math.round(music * 100)} className="w-full"
            onChange={(event) => setMusic(Number(event.target.value) / 100)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save defaults</Button>
        <p className="text-[10px] text-[var(--fg-muted)]">
          Applies to clips rendered from now on. Clips already cut keep their levels until you re-render them.
        </p>
      </div>
    </details>
  )
}

/**
 * Two clicks, so a stray one cannot lose a clip: the first arms it, the second sends the clip and its
 * preview to the Windows Recycle Bin. A clip still on the YouTube schedule is uploaded from this file,
 * so it has to come off YouTube first.
 */
function DeleteClipButton({ campaignId, clip, scheduled, busy, compact = false, onDeleted }: {
  campaignId: string; clip: RenderedClip; scheduled?: PublishJob; busy?: boolean; compact?: boolean; onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(timer)
  }, [armed])
  const outputsKey = ["campaign", campaignId, "outputs"]
  const remove = useMutation({
    mutationFn: () => api.deleteOutput(campaignId, clip.relativePath),
    onSuccess: () => {
      toast.success("Deleted. It is in the Recycle Bin if you need it back.")
      queryClient.setQueryData<RenderedClip[]>(outputsKey, (current) => current?.filter((item) => item.relativePath !== clip.relativePath))
      queryClient.invalidateQueries({ queryKey: outputsKey })
      onDeleted?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => setArmed(false),
  })
  const onYouTube = Boolean(scheduled && scheduled.status !== "Published")
  const blockedReason = onYouTube ? "On the YouTube schedule. Take it off YouTube first." : busy ? "Wait for the re-render to finish." : undefined
  const label = `Delete ${clip.title || clip.fileName}`

  if (armed) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="destructive" size="sm" className={compact ? "h-8 px-2.5 text-xs shadow" : undefined}
          disabled={remove.isPending} onClick={() => remove.mutate()} aria-label={`Confirm: ${label}`}>
          <Trash2 /> {remove.isPending ? "Deleting..." : compact ? "Delete?" : "Yes, delete"}
        </Button>
        {!compact && <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>Keep</Button>}
      </div>
    )
  }
  return compact ? (
    <Button variant="ghost" size="icon" className="size-8 bg-[var(--surface-raised)]/90 text-[var(--fg-muted)] hover:text-[var(--danger-solid)]"
      disabled={Boolean(blockedReason)} title={blockedReason ?? "Delete clip"} aria-label={label} onClick={() => setArmed(true)}>
      <Trash2 />
    </Button>
  ) : (
    <Button variant="ghost" size="sm" className="text-[var(--danger-solid)]" disabled={Boolean(blockedReason)}
      title={blockedReason} onClick={() => setArmed(true)}>
      <Trash2 /> Delete
    </Button>
  )
}

/** The thumbnail a clip keeps once its video is in Google Drive. */
const posterSrc = (campaignId: string, clip: RenderedClip) =>
  `${API_BASE_URL}/campaigns/${campaignId}/outputs/poster?path=${encodeURIComponent(clip.relativePath)}`

/** A clip waiting to go up on YouTube still needs its file on this PC. */
const waitingForYouTube = (scheduled?: PublishJob) => Boolean(scheduled && scheduled.status !== "Published")

/**
 * Uploads the clip to Google Drive, checks every file there, and only then frees it on this PC, the way the
 * YtPipeline app does. Two clicks, like Delete, because the clip stops playing here until it is brought back.
 */
function MoveToDriveButton({ campaignId, clip, scheduled, busy, compact = false }: {
  campaignId: string; clip: RenderedClip; scheduled?: PublishJob; busy?: boolean; compact?: boolean
}) {
  const queryClient = useQueryClient()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 6000)
    return () => window.clearTimeout(timer)
  }, [armed])
  const move = useMutation({
    mutationFn: () => api.moveToDrive(campaignId, clip.relativePath),
    onSuccess: (moved) => {
      toast.success(`In Google Drive and checked. Freed ${formatBytes(moved.bytes)} on this PC.`)
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => setArmed(false),
  })
  const blockedReason = waitingForYouTube(scheduled) ? "On the YouTube schedule. Move it once it has gone up."
    : busy ? "Wait for the re-render to finish." : undefined
  const label = `Move ${clip.title || clip.fileName} to Google Drive`

  if (move.isPending) {
    return compact
      ? <Button variant="ghost" size="icon" className="size-8 bg-[var(--surface-raised)]/90" disabled aria-label="Moving to Google Drive"><CloudUpload className="animate-pulse" /></Button>
      : <Button variant="ghost" size="sm" disabled><CloudUpload className="animate-pulse" /> Moving to Google Drive...</Button>
  }
  if (armed) {
    return compact ? (
      <Button size="sm" className="h-8 px-2.5 text-xs shadow" onClick={() => move.mutate()} aria-label={`Confirm: ${label}`}>
        <CloudUpload /> Move?
      </Button>
    ) : (
      <div className="w-full space-y-2 rounded-lg bg-[var(--surface-subtle)] p-2.5">
        <p className="text-[11px] text-[var(--fg-body)]">
          Uploads to Google Drive, checks every file there, then frees {formatBytes(clip.sizeBytes)} on this PC. The clip
          stays in this list, and Bring back fetches it again whenever you need it.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => move.mutate()} aria-label={`Confirm: ${label}`}><CloudUpload /> Yes, move</Button>
          <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>Keep here</Button>
        </div>
      </div>
    )
  }
  return compact ? (
    <Button variant="ghost" size="icon" className="size-8 bg-[var(--surface-raised)]/90 text-[var(--fg-muted)] hover:text-[var(--fg-strong)]"
      disabled={Boolean(blockedReason)} title={blockedReason ?? "Move to Google Drive"} aria-label={label} onClick={() => setArmed(true)}>
      <CloudUpload />
    </Button>
  ) : (
    <Button variant="ghost" size="sm" disabled={Boolean(blockedReason)} title={blockedReason} onClick={() => setArmed(true)}>
      <CloudUpload /> Move to Google Drive
    </Button>
  )
}

/** Downloads a moved clip and checks it. One click: nothing is lost by bringing a clip home. */
function BringBackButton({ campaignId, clip, compact = false }: { campaignId: string; clip: RenderedClip; compact?: boolean }) {
  const queryClient = useQueryClient()
  const bring = useMutation({
    mutationFn: () => api.bringBackFromDrive(campaignId, clip.relativePath),
    onSuccess: () => {
      toast.success("Back on this PC and checked. The copy in Google Drive stays.")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return compact ? (
    <Button variant="ghost" size="icon" className="size-8 bg-[var(--surface-raised)]/90 text-[var(--fg-muted)] hover:text-[var(--fg-strong)]"
      disabled={bring.isPending} title="Bring back from Google Drive" aria-label={`Bring ${clip.title || clip.fileName} back from Google Drive`}
      onClick={() => bring.mutate()}>
      <CloudDownload className={bring.isPending ? "animate-pulse" : undefined} />
    </Button>
  ) : (
    <Button size="sm" disabled={bring.isPending} onClick={() => bring.mutate()}>
      <CloudDownload className={bring.isPending ? "animate-pulse" : undefined} />
      {bring.isPending ? "Bringing back..." : "Bring back from Google Drive"}
    </Button>
  )
}

/**
 * Moves every clip that can go, one after another, and stops at the first that cannot: whatever stopped it (no
 * connection, rclone signed out) would stop the rest too, and nothing already moved or left behind is at risk.
 */
function MoveAllToDrive({ campaignId, clips, schedule, busyPlans }: {
  campaignId: string; clips: RenderedClip[]; schedule?: YouTubeSchedule; busyPlans: Set<string>
}) {
  const queryClient = useQueryClient()
  const [armed, setArmed] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const stop = useRef(false)
  const eligible = clips.filter((clip) => !clip.drive && !waitingForYouTube(scheduleFor(clip, schedule?.items))
    && !(clip.editPlanId && busyPlans.has(clip.editPlanId)))
  const bytes = eligible.reduce((sum, clip) => sum + clip.sizeBytes, 0)

  const run = async () => {
    setArmed(false)
    stop.current = false
    let moved = 0
    let freed = 0
    setProgress({ done: 0, total: eligible.length })
    for (const clip of eligible) {
      if (stop.current) break
      try {
        freed += (await api.moveToDrive(campaignId, clip.relativePath)).bytes
        moved++
      } catch (error) {
        toast.error(`Stopped at "${clip.title || clip.fileName}": ${getErrorMessage(error)}`)
        break
      } finally {
        setProgress({ done: moved, total: eligible.length })
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
      }
    }
    setProgress(null)
    if (moved) toast.success(`Moved ${moved} clip${moved === 1 ? "" : "s"} to Google Drive, freeing ${formatBytes(freed)} on this PC.`)
  }

  if (progress) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-strong)]">
        <CloudUpload className="size-4 animate-pulse" /> Moving {Math.min(progress.done + 1, progress.total)} of {progress.total}...
        <Button variant="ghost" size="sm" onClick={() => { stop.current = true }}>Stop after this one</Button>
      </div>
    )
  }
  if (armed) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-body)]">
        <span>Move {eligible.length} clips ({formatBytes(bytes)}) to Google Drive?</span>
        <Button size="sm" onClick={() => void run()}>Move all</Button>
        <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>Cancel</Button>
      </div>
    )
  }
  return (
    <Button variant="outline" size="sm" disabled={eligible.length === 0} onClick={() => setArmed(true)}
      title={eligible.length ? undefined : "Every clip is already in Google Drive or waiting to go up on YouTube."}>
      <Cloud /> Move all to Drive
    </Button>
  )
}

/** With several YouTube pages and none chosen for this campaign, there is no page to schedule on yet. */
const mustChoosePage = (schedule: YouTubeSchedule) => !schedule.pageId && schedule.pages.length > 1

/**
 * Which YouTube page this campaign's clips go to. Hidden while there is only one page, since every
 * campaign then uses it.
 */
function CampaignYouTubePage({ campaignId, schedule }: { campaignId: string; schedule: YouTubeSchedule }) {
  const queryClient = useQueryClient()
  const choose = useMutation({
    mutationFn: (pageId: string) => api.setCampaignYouTubePage(campaignId, pageId),
    onSuccess: (updated) => {
      toast.success(`This campaign's clips now go to ${updated.channel ?? "that page"}.`)
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  if (schedule.pages.length < 2) return null
  return (
    <div className="mb-4 space-y-2 rounded-xl border border-[var(--border-default)] p-3">
      <YouTubePagePicker label="YouTube page for this campaign" pages={schedule.pages} value={schedule.pageId}
        disabled={choose.isPending} onChange={(pageId) => { if (pageId !== schedule.pageId) choose.mutate(pageId) }} />
      <p className="text-[11px] text-[var(--fg-muted)]">
        {schedule.pageId
          ? "Clips you schedule from here upload to this page. Clips already scheduled stay on the page they were sent to."
          : "Pick the page this campaign posts to. Until you do, its clips cannot be scheduled."}
      </p>
    </div>
  )
}

/** Puts a clip into the next free daily slot. Shared by the tile's button and the clip window. */
function useScheduleOnYouTube(campaignId: string, clip: RenderedClip, onSettled: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.scheduleOnYouTube(campaignId, {
      outputRelativePath: clip.relativePath, editPlanId: clip.editPlanId, title: clip.title || clip.fileName,
      caption: clip.caption ?? "", idempotencyKey: crypto.randomUUID(),
    }),
    onSuccess: (created) => {
      toast.success(`Scheduled. Goes public ${formatSlot(created.scheduledPublishAt)}.`)
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled,
  })
}

/**
 * The tile's shortcut to the YouTube schedule, so a page of clips can be scheduled without opening each
 * one. Two clicks, like Delete: the second one uploads the clip, and its label says when it goes public.
 */
export function ScheduleOnYouTubeButton({ campaignId, clip, schedule, scheduled, busy }: {
  campaignId: string; clip: RenderedClip; schedule?: YouTubeSchedule; scheduled?: PublishJob; busy?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 6000)
    return () => window.clearTimeout(timer)
  }, [armed])
  const add = useScheduleOnYouTube(campaignId, clip, () => setArmed(false))
  // Already on the schedule: the tile's badge shows its time, and taking it off lives in the clip window.
  if (!schedule || scheduled) return null
  const blockedReason = mustChoosePage(schedule) ? "Choose this campaign's YouTube page first, above the clips."
    : !(schedule.connected && schedule.canManage) ? "Connect YouTube under Publishing first."
    : busy ? "Wait for the re-render to finish." : undefined
  const label = `Schedule ${clip.title || clip.fileName} on YouTube`

  if (add.isPending) {
    return <Button variant="ghost" size="icon" className="size-8 bg-[var(--surface-raised)]/90" disabled aria-label="Scheduling on YouTube"><CalendarClock className="animate-pulse" /></Button>
  }
  if (armed) {
    return (
      <Button variant="brand" size="sm" className="h-8 px-2.5 text-xs shadow" onClick={() => add.mutate()} aria-label={`Confirm: ${label}`}
        title={`Uploads now${schedule.channel ? ` to ${schedule.channel}` : ""} as private. Goes public ${formatSlot(schedule.nextFreeSlot)}.`}>
        <CalendarClock /> {formatSlotShort(schedule.nextFreeSlot)}?
      </Button>
    )
  }
  return (
    <Button variant="ghost" size="icon" className="size-8 bg-[var(--surface-raised)]/90 text-[var(--fg-muted)] hover:text-[var(--fg-strong)]"
      disabled={Boolean(blockedReason)}
      title={blockedReason ?? `Schedule on YouTube${schedule.pages.length > 1 && schedule.channel ? ` (${schedule.channel})` : ""} · ${formatSlot(schedule.nextFreeSlot)}`}
      aria-label={label} onClick={() => setArmed(true)}>
      <CalendarClock />
    </Button>
  )
}

/**
 * The clip's car mark. The "Cars only" switch above the grid goes by the words in a clip's title and caption;
 * this is where a clip those words get wrong is put right, in either direction. Needs no re-render.
 */
export function CarMarkButton({ campaignId, clip }: { campaignId: string; clip: RenderedClip }) {
  const queryClient = useQueryClient()
  const outputsKey = ["campaign", campaignId, "outputs"]
  const car = Boolean(clip.car)
  const mark = useMutation({
    mutationFn: () => api.setClipCar(clip.editPlanId!, !car),
    onSuccess: (saved) => {
      queryClient.setQueryData<RenderedClip[]>(outputsKey, (current) =>
        current?.map((item) => item.editPlanId === clip.editPlanId ? { ...item, car: saved.car } : item))
      queryClient.invalidateQueries({ queryKey: outputsKey })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const name = clip.title || clip.fileName
  return (
    <Button variant={car ? "brand" : "ghost"} size="icon"
      className={car ? "size-8 shadow" : "size-8 bg-black/55 text-white/80 hover:bg-black/75 hover:text-white"}
      disabled={!clip.editPlanId || mark.isPending} aria-pressed={car}
      aria-label={car ? `Car clip: ${name}. Mark as not a car clip` : `Mark ${name} as a car clip`}
      title={!clip.editPlanId ? "This clip has no saved edit, so its mark cannot be changed."
        : car ? "Car clip. Click if it is not one." : "Not a car clip. Click to mark it as one."}
      onClick={() => mark.mutate()}>
      <CarFront />
    </Button>
  )
}

/** Progress for one clip's re-render, shown wherever that clip appears. */
function RerenderProgress({ job, label = "Re-rendering" }: { job: Job; label?: string }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="size-3.5 animate-spin" />
          {job.status === "Queued" ? "Waiting for a slot..." : `${label}...`}
        </span>
        <span className="tabular-nums">{Math.round(job.progress ?? 0)}%</span>
      </div>
      <Progress value={job.progress ?? 0} />
      <p className="text-[10px] text-[var(--fg-muted)]">
        Keeps running if you close this - the clip shows its progress in the grid.
      </p>
    </div>
  )
}

/**
 * The compact grid tile: a poster, the title and the few facts worth scanning. Everything you can
 * change lives in the detail dialog, so a page of twelve stays readable.
 */
function ClipTile({ campaignId, clip, job, schedule, scheduled, onOpen }: {
  campaignId: string; clip: RenderedClip; job?: Job; schedule?: YouTubeSchedule; scheduled?: PublishJob; onOpen: () => void
}) {
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}`
  const gaps = clip.style?.gaps?.length ?? 0
  const length = clipLength(clip)
  // The delete control sits beside the open button, not inside it: a button inside a button is invalid
  // and its click would also open the clip.
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] transition hover:border-[var(--border-strong)] hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
      >
        <div className="relative aspect-[9/16] max-h-64 w-full overflow-hidden bg-[var(--surface-inverse)]">
          {clip.drive
            ? <img className="size-full object-cover" src={posterSrc(campaignId, clip)} alt="" />
            : <video className="size-full object-cover" src={src} preload="metadata" muted playsInline tabIndex={-1} />}
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover:opacity-100">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-ink shadow"><Play className="size-5" /></span>
          </div>
          {job ? (
            <span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold text-white">
              <RefreshCw className="size-3 animate-spin" />
              {job.status === "Queued" ? "Queued" : `${job.type === "BrollRepair" ? "Finding B-roll" : "Re-rendering"} ${Math.round(job.progress ?? 0)}%`}
            </span>
          ) : (
            <>
              {gaps > 0 && (
                <span className="absolute left-12 top-2.5 flex items-center gap-1 rounded-full bg-[var(--warning-solid,#b45309)] px-2 py-0.5 text-[10px] font-semibold text-white">
                  <AlertTriangle className="size-3" /> B-roll
                </span>
              )}
              {length && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">{length}</span>
              )}
              {clip.drive && (
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <Cloud className="size-3" /> In Google Drive
                </span>
              )}
              {scheduled && (
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#c00] px-2 py-0.5 text-[10px] font-semibold text-white">
                  <SquarePlay className="size-3" /> {scheduled.status === "Published" ? "Public" : formatSlot(scheduled.scheduledPublishAt)}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3 pr-28">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--fg-strong)]">{clip.title || clip.fileName}</p>
          <p className="text-[11px] text-[var(--fg-muted)]">
            {platformLabels[clip.platform.toLowerCase()] ?? clip.platform} · {formatBytes(clip.sizeBytes)}
          </p>
          {clip.sourcePublishedOn ? (
            <p className="truncate text-[11px] text-[var(--fg-muted)]" title={clip.sourceTitle ?? undefined}>
              Video from <span className="font-semibold text-[var(--fg-body)]">{formatDay(clip.sourcePublishedOn)}</span>
            </p>
          ) : null}
        </div>
      </button>
      <div className="absolute left-2 top-2"><CarMarkButton campaignId={campaignId} clip={clip} /></div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        {clip.drive ? (
          <BringBackButton compact campaignId={campaignId} clip={clip} />
        ) : (
          <>
            <ScheduleOnYouTubeButton campaignId={campaignId} clip={clip} schedule={schedule} scheduled={scheduled} busy={Boolean(job)} />
            <MoveToDriveButton compact campaignId={campaignId} clip={clip} scheduled={scheduled} busy={Boolean(job)} />
            <DeleteClipButton compact campaignId={campaignId} clip={clip} scheduled={scheduled} busy={Boolean(job)} />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * One click puts the clip into the next free daily slot; YouTube makes it public then. A second button
 * takes it off again and moves every later clip up a slot.
 */
function YouTubeBlock({ campaignId, clip, schedule, blocked }: { campaignId: string; clip: RenderedClip; schedule?: YouTubeSchedule; blocked: boolean }) {
  const [armed, setArmed] = useState(false)
  const job = scheduleFor(clip, schedule?.items)
  const add = useScheduleOnYouTube(campaignId, clip, () => setArmed(false))
  if (!schedule) return null
  const ready = schedule.connected && schedule.canManage
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border-default)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg-strong)]"><SquarePlay className="size-3.5" /> YouTube</p>
      {job ? (
        <>
          <p className="text-sm font-semibold">
            {job.status === "Published" ? "Went public" : "Goes public"} {formatSlot(job.scheduledPublishAt)}
          </p>
          <p className="text-[11px] text-[var(--fg-muted)]">{scheduleState(job)}</p>
          <div className="flex flex-wrap gap-2">
            {shortsUrl(job) ? <Button variant="ghost" size="sm" asChild><a href={shortsUrl(job)!} target="_blank" rel="noreferrer"><ExternalLink /> Open on YouTube</a></Button> : null}
            {job.status !== "Published" ? <TakeOffButton job={job} /> : null}
          </div>
        </>
      ) : !ready ? (
        <p className="text-[11px] text-[var(--fg-muted)]">{schedule.message}{mustChoosePage(schedule) ? "" : " Set it up under Publishing, then YouTube schedule."}</p>
      ) : armed ? (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--fg-body)]">
            Uploads <strong>{clip.title || clip.fileName}</strong>{schedule.channel ? <> to <strong>{schedule.channel}</strong></> : null} now, as private.
            YouTube makes it public <strong>{formatSlot(schedule.nextFreeSlot)}</strong>.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Scheduling..." : "Confirm"}</Button>
            <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" variant="outline" size="sm" disabled={blocked} onClick={() => setArmed(true)}>
          <CalendarClock /> Schedule on YouTube · {formatSlot(schedule.nextFreeSlot)}
        </Button>
      )}
    </div>
  )
}

/** Everything you can play, tune or re-cut for one clip. Mounted only while its tile is open. */
export function ClipDetail({
  campaignId, clip, defaultVoice, defaultMusic, musicLocationId, excludedMusic, job, repairJob, schedule, onRerender, onRepair, onRepairApplied, onClose,
}: {
  campaignId: string; clip: RenderedClip; defaultVoice: number; defaultMusic: number
  schedule?: YouTubeSchedule
  musicLocationId?: string | null; excludedMusic?: string[] | null
  job?: Job; repairJob?: Job
  onRerender: (editPlanId: string, jobId: string) => void
  onRepair?: (editPlanId: string, jobId: string) => void
  onRepairApplied?: (editPlanId: string) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const player = useRef<HTMLVideoElement>(null)
  // One versioned file drives playback AND download: pause/seek/resume cannot desynchronise a
  // separate music element, and a finished replacement cannot reuse stale browser media bytes.
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}&v=${encodeURIComponent(`${clip.createdAt}-${clip.sizeBytes}`)}`
  const [voice, setVoice] = useState(clip.style?.voiceVolume ?? defaultVoice)
  const [music, setMusic] = useState(clip.style?.musicVolume ?? defaultMusic)
  // Set once the bed or the levels differ from what is baked into the file on disk.
  const [dirty, setDirty] = useState(false)
  const duration = Math.max(0, (clip.endSeconds ?? 0) - (clip.startSeconds ?? 0))
  const [repairStart, setRepairStart] = useState(0)
  const [repairEnd, setRepairEnd] = useState(Math.min(3, duration))
  const [repairNote, setRepairNote] = useState("")
  const [editorOpen, setEditorOpen] = useState(false)

  const preview = useQuery({
    queryKey: ["clip-preview", clip.editPlanId],
    queryFn: () => api.clipPreview(clip.editPlanId!),
    enabled: Boolean(clip.editPlanId && clip.style),
  })
  // Only the beds this campaign draws from, so one show's music cannot turn up under another's -
  // and never a song it has blacklisted, which must not be offered any more than it is auto-picked.
  const assets = useQuery({ queryKey: ["media-assets"], queryFn: () => api.mediaAssets() })
  const banned = new Set((excludedMusic ?? []).map((name) => name.toLowerCase()))
  const songs = (assets.data ?? []).filter((asset) =>
    asset.type === "Music"
    && (!musicLocationId || asset.locationId === musicLocationId)
    && !banned.has(asset.name.toLowerCase()))

  const reveal = useMutation({
    mutationFn: () => api.revealOutput(campaignId, clip.relativePath),
    onSuccess: (result) => { if (!result.revealed) toast.info(result.folder ?? "Could not open the folder.") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const chooseMusic = useMutation({
    mutationFn: (assetId: string) => api.setClipMusic(clip.editPlanId!, assetId),
    onSuccess: () => {
      setDirty(true)
      queryClient.invalidateQueries({ queryKey: ["clip-preview", clip.editPlanId] })
      toast.success("Song selected. Re-render to hear and save the updated mix.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const rerender = useMutation({
    mutationFn: () => api.rerenderClip(clip.editPlanId!, { voiceVolume: voice, musicVolume: music }),
    onSuccess: (started) => { onRerender(clip.editPlanId!, started.id) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const startRepair = useMutation({
    mutationFn: () => api.startBrollRepair(clip.editPlanId!, {
      startSeconds: repairStart, endSeconds: repairEnd, note: repairNote.trim() || undefined,
    }),
    onSuccess: (started) => {
      onRepair?.(clip.editPlanId!, started.id)
      toast.info("Finding footage that matches the marked dialogue. Your current video is unchanged.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const repairCandidate = useQuery({
    queryKey: ["broll-repair", clip.editPlanId, repairJob?.id],
    queryFn: () => api.brollRepairCandidate(clip.editPlanId!, repairJob!.id),
    enabled: Boolean(clip.editPlanId && repairJob?.status === "Completed"),
    retry: 1,
  })
  const applyRepair = useMutation({
    mutationFn: () => api.applyBrollRepair(clip.editPlanId!, repairJob!.id),
    onSuccess: () => {
      toast.success("B-roll repaired. The previous version is archived; the gallery has one copy.")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
      queryClient.invalidateQueries({ queryKey: ["clip-preview", clip.editPlanId] })
      onRepairApplied?.(clip.editPlanId!)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const running = Boolean(job) || rerender.isPending

  const range = clipRange(clip)
  // Re-rendering, repairs and scheduling all need the video; a moved clip offers them again once it is back.
  const tunable = Boolean(clip.style && clip.editPlanId && !clip.drive)
  const needsRender = dirty || Boolean(preview.data?.musicNeedsRender)
  const saveBlocked = needsRender || running || chooseMusic.isPending || (tunable && !preview.isSuccess)

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex justify-center rounded-xl bg-[var(--surface-inverse)] p-2">
          {clip.drive ? (
            <img className="max-h-[52vh] w-auto rounded-lg" src={posterSrc(campaignId, clip)} alt="" />
          ) : (
            <video
              ref={player}
              className="max-h-[52vh] w-auto rounded-lg"
              src={src}
              controls
              preload="metadata"
              playsInline
            />
          )}
        </div>
        {clip.drive ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--fg-muted)]">
              In Google Drive since {formatDate(clip.drive.movedAt, true)}, at <span className="break-all font-mono text-[10px]">{clip.drive.remote}</span>.
              Bring it back to play, re-render or post it.
            </p>
            <BringBackButton campaignId={campaignId} clip={clip} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
              <FolderOpen /> Show in folder
            </Button>
            {saveBlocked ? (
              <Button variant="ghost" size="sm" disabled><Download /> Save a copy</Button>
            ) : (
              <Button variant="ghost" size="sm" asChild>
                <a href={src} download={clip.fileName}><Download /> Save a copy</a>
              </Button>
            )}
            <DeleteClipButton campaignId={campaignId} clip={clip} scheduled={scheduleFor(clip, schedule?.items)}
              busy={running || Boolean(repairJob && !isTerminal(repairJob.status))} onDeleted={onClose} />
            <MoveToDriveButton campaignId={campaignId} clip={clip} scheduled={scheduleFor(clip, schedule?.items)}
              busy={running || Boolean(repairJob && !isTerminal(repairJob.status))} />
          </div>
        )}
        {needsRender || running ? (
          <p className="text-xs text-[var(--fg-muted)]">This player shows the last finished mix. Re-rendering must finish before you can save the updated copy.</p>
        ) : null}
        {preview.isError ? <p className="text-xs text-[var(--fg-muted)]">Could not check this clip's music settings. Reload before saving.</p> : null}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
          <Badge variant="default">{platformLabels[clip.platform.toLowerCase()] ?? clip.platform}</Badge>
          <span>{formatBytes(clip.sizeBytes)}</span>
          <span>· {formatDate(clip.createdAt, true)}</span>
          {range && <span>· {range}</span>}
        </div>
        {clip.sourceTitle || clip.sourcePublishedOn ? (
          <p className="text-xs text-[var(--fg-muted)]">
            Cut from {clip.sourceTitle ? <span className="font-semibold text-[var(--fg-body)]">{clip.sourceTitle}</span> : "its video"}
            {clip.sourcePublishedOn ? <>, published {formatDay(clip.sourcePublishedOn)}</> : null}
          </p>
        ) : null}

        {tunable ? (
          <div className="space-y-3 rounded-xl border border-[var(--border-default)] p-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]" htmlFor={`song-${clip.editPlanId}`}>
                <Music className="size-3.5" /> Song
              </label>
              <Select
                value={preview.data?.musicAssetId ?? ""}
                onValueChange={(value) => chooseMusic.mutate(value)}
                disabled={chooseMusic.isPending || running || songs.length === 0}
              >
                <SelectTrigger id={`song-${clip.editPlanId}`} className="w-full">
                  <SelectValue placeholder={assets.isLoading ? "Loading songs..." : "Pick a song"} />
                </SelectTrigger>
                <SelectContent>
                  {songs.map((song) => <SelectItem key={song.id} value={song.id}>{song.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
                Each song enters at its own marked segment. Choose a song, then re-render to hear the result.
              </p>
            </div>

            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor={`voice-${clip.editPlanId}`}>
                <span>Podcast voice</span><span className="tabular-nums">{pct(voice)}</span>
              </label>
              <input id={`voice-${clip.editPlanId}`} type="range" min={50} max={200} value={Math.round(voice * 100)} className="w-full"
                disabled={running || chooseMusic.isPending}
                onChange={(event) => { setVoice(Number(event.target.value) / 100); setDirty(true) }} />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor={`music-${clip.editPlanId}`}>
                <span>Music</span><span className="tabular-nums">{pct(music)}</span>
              </label>
              <input id={`music-${clip.editPlanId}`} type="range" min={0} max={60} value={Math.round(music * 100)} className="w-full"
                disabled={running || chooseMusic.isPending}
                onChange={(event) => { setMusic(Number(event.target.value) / 100); setDirty(true) }} />
            </div>

            <p className="text-[10px] text-[var(--fg-muted)]">
              Re-render to apply these levels. Playback and Save a copy use the same finished video and music mix.
            </p>

            {job ? <RerenderProgress job={job} /> : (
              <Button className="w-full" variant={needsRender ? "default" : "outline"} size="sm"
                disabled={rerender.isPending || chooseMusic.isPending || !preview.isSuccess} onClick={() => rerender.mutate()}>
                <RefreshCw className={rerender.isPending ? "animate-spin" : undefined} />
                {needsRender ? "Re-render with these changes" : "Re-render"}
              </Button>
            )}
          </div>
        ) : null}

        {tunable ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-default)] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--fg-strong)]">B-roll editor</p>
              <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
                See what is said over each shot, download footage from a pasted link, and put it exactly where you want it.
              </p>
            </div>
            <Button size="sm" disabled={running} onClick={() => setEditorOpen(true)}><Clapperboard /> Edit B-roll</Button>
            <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
              <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="pr-6 text-base leading-snug">Edit B-roll · {clip.title || clip.fileName}</DialogTitle>
                </DialogHeader>
                {editorOpen ? <BrollEditor campaignId={campaignId} clip={clip} /> : null}
              </DialogContent>
            </Dialog>
          </div>
        ) : null}

        {tunable ? (
          <div className="space-y-3 rounded-xl border border-[var(--border-default)] p-3">
            <div>
              <p className="text-xs font-semibold text-[var(--fg-strong)]">Repair B-roll</p>
              <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
                Mark the mismatched seconds in this clip. The marked range expands to full B-roll shots; speech, captions, music and the highlight timing stay unchanged.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-[var(--fg-strong)]">
                From (seconds)
                <input aria-label="B-roll repair start" type="number" min={0} max={duration} step="0.1" value={repairStart}
                  onChange={(event) => setRepairStart(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1.5" />
              </label>
              <label className="text-[11px] font-semibold text-[var(--fg-strong)]">
                To (seconds)
                <input aria-label="B-roll repair end" type="number" min={0} max={duration} step="0.1" value={repairEnd}
                  onChange={(event) => setRepairEnd(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1.5" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setRepairStart(Number((player.current?.currentTime ?? 0).toFixed(1)))}>Start at player time</Button>
              <Button variant="outline" size="sm" onClick={() => setRepairEnd(Number((player.current?.currentTime ?? 0).toFixed(1)))}>End at player time</Button>
            </div>
            <label className="block text-[11px] font-semibold text-[var(--fg-strong)]">
              What looks wrong? (optional)
              <input aria-label="B-roll repair note" maxLength={400} value={repairNote} onChange={(event) => setRepairNote(event.target.value)}
                placeholder="e.g. This is a reporter, not Pat Riley"
                className="mt-1 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1.5" />
            </label>
            {repairJob?.status === "Queued" || repairJob?.status === "Running" ? <RerenderProgress job={repairJob} label="Finding B-roll" /> : null}
            {!repairJob || repairJob.status === "Failed" ? (
              <Button variant="outline" size="sm" className="w-full" disabled={startRepair.isPending || running ||
                !Number.isFinite(repairStart) || !Number.isFinite(repairEnd) || repairEnd <= repairStart || repairEnd - repairStart > 20 || repairEnd > duration}
                onClick={() => startRepair.mutate()}>
                <Film /> {startRepair.isPending ? "Queueing repair..." : "Find replacement B-roll"}
              </Button>
            ) : null}
            {repairJob?.status === "Completed" && repairCandidate.data ? (
              <div className="space-y-2 rounded-lg bg-[var(--surface-subtle)] p-2.5">
                <p className="text-xs font-semibold">Preview replacement before applying</p>
                <p className="text-[10px] text-[var(--fg-muted)]">
                  Replaces {repairCandidate.data.startSeconds.toFixed(1)}–{repairCandidate.data.endSeconds.toFixed(1)}s:
                  {" "}{repairCandidate.data.spokenText}
                </p>
                <video controls preload="metadata" playsInline className="mx-auto max-h-80 rounded-md"
                  src={`${API_BASE_URL.replace(/\/api$/, "")}${repairCandidate.data.previewUrl}`} />
                <ul className="space-y-1 text-[10px] text-[var(--fg-muted)]">
                  {repairCandidate.data.shots.map((shot, index) => <li key={index}>
                    {shot.sourceUrl ? <a href={shot.sourceUrl} target="_blank" rel="noreferrer" className="underline">{shot.sourceTitle || shot.query}</a> : shot.sourceTitle || shot.query}
                  </li>)}
                </ul>
                <Button size="sm" className="w-full" disabled={applyRepair.isPending} onClick={() => applyRepair.mutate()}>
                  <Check /> {applyRepair.isPending ? "Applying..." : "Apply this B-roll repair"}
                </Button>
                <Button variant="outline" size="sm" className="w-full" disabled={startRepair.isPending || applyRepair.isPending ||
                  repairEnd <= repairStart || repairEnd - repairStart > 20 || repairEnd > duration}
                  onClick={() => startRepair.mutate()}>
                  <RefreshCw /> {startRepair.isPending ? "Queueing..." : "Find another replacement"}
                </Button>
                <p className="text-[10px] text-[var(--fg-muted)]">If it still looks wrong, find another or leave it unapplied. Your current clip stays in the gallery.</p>
              </div>
            ) : null}
            {repairJob?.status === "Completed" && repairCandidate.isError ?
              <p className="text-xs text-[var(--warning-solid,#b45309)]">The candidate preview is unavailable. The current clip has not changed.</p> : null}
          </div>
        ) : null}

        {clip.drive ? null : <YouTubeBlock campaignId={campaignId} clip={clip} schedule={schedule} blocked={saveBlocked} />}
        {clip.title ? <CopyField label="Title" value={clip.title} /> : null}
        {clip.caption ? <CopyField label="Caption" value={clip.caption} multiline /> : null}
        <ClipFootage clip={clip} />
        <p className="truncate font-mono text-[10px] text-[var(--fg-muted)]" title={clip.fileName}>{clip.fileName}</p>
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

export function RenderedClipsCard({ campaignId, editStyle }: { campaignId: string; editStyle?: CampaignEditStyle | null }) {
  const queryClient = useQueryClient()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [openTitle, setOpenTitle] = useState<string | null>(null)
  // Re-renders are tracked HERE, not inside the dialog: closing the dialog must not lose sight of a
  // job that is still running on the server. Keyed by the plan that was re-rendered.
  const [renderJobs, setRenderJobs] = useState<Record<string, string>>({})
  const [repairJobs, setRepairJobs] = useState<Record<string, string>>(() => {
    try { return JSON.parse(window.localStorage.getItem(`broll-repair-jobs:${campaignId}`) || "{}") as Record<string, string> }
    catch { return {} }
  })
  useEffect(() => {
    try { window.localStorage.setItem(`broll-repair-jobs:${campaignId}`, JSON.stringify(repairJobs)) }
    catch { /* Repair jobs still work for this session if browser storage is unavailable. */ }
  }, [campaignId, repairJobs])
  const trackedIds = useMemo(() => [...new Set([...Object.values(renderJobs), ...Object.values(repairJobs)])].sort(), [renderJobs, repairJobs])
  const watching = trackedIds.length > 0

  // The page this campaign posts to, so slots, badges and buttons are that page's and no other's.
  const schedule = useYouTubeSchedule({ campaignId })
  const clips = useQuery({
    queryKey: ["campaign", campaignId, "outputs"],
    queryFn: () => api.renderedClips(campaignId),
    refetchInterval: 20_000,
  })
  // One poll covers every clip being re-rendered at once.
  const jobs = useQuery({
    queryKey: ["campaign", campaignId, "clip-jobs", trackedIds],
    queryFn: () => Promise.all(trackedIds.map((id) => api.job(id))),
    enabled: watching,
    refetchInterval: (query) => {
      if (!watching) return false
      const rows = query.state.data ?? []
      return trackedIds.every((id) => isTerminal(rows.find((row) => row.id === id)?.status)) ? false : 1500
    },
  })
  const jobById = useMemo(() => new Map((jobs.data ?? []).map((job) => [job.id, job])), [jobs.data])
  // Clips with a re-render or repair still running: their files are about to change, so they stay here.
  const busyPlans = useMemo(() => new Set([...Object.entries(renderJobs), ...Object.entries(repairJobs)]
    .filter(([, jobId]) => !isTerminal(jobById.get(jobId)?.status)).map(([planId]) => planId)), [renderJobs, repairJobs, jobById])

  useEffect(() => {
    const finished = Object.entries(renderJobs).filter(([, jobId]) => isTerminal(jobById.get(jobId)?.status))
    if (finished.length === 0) return
    for (const [, jobId] of finished) {
      const job = jobById.get(jobId)!
      if (job.status === "Completed") toast.success("Re-render finished. It replaced the older cut of this clip.")
      else if (job.status === "Failed") toast.error(job.errorSummary || "The re-render failed. The older cut was kept.")
    }
    const timer = window.setTimeout(() => setRenderJobs((current) => {
      const next = { ...current }
      for (const [planId] of finished) delete next[planId]
      return next
    }), 0)
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
    queryClient.invalidateQueries({ queryKey: ["clip-preview"] })
    return () => window.clearTimeout(timer)
  }, [jobById, renderJobs, campaignId, queryClient])

  useEffect(() => {
    const failed = Object.entries(repairJobs).filter(([, jobId]) =>
      ["Failed", "Cancelled"].includes(jobById.get(jobId)?.status ?? ""))
    if (!failed.length) return
    for (const [, jobId] of failed) toast.error(jobById.get(jobId)?.errorSummary || "B-roll repair failed. The original clip was kept.")
    const timer = window.setTimeout(() => setRepairJobs((current) => {
      const next = { ...current }
      for (const [planId] of failed) delete next[planId]
      return next
    }), 0)
    return () => window.clearTimeout(timer)
  }, [jobById, repairJobs])

  // "Cars only" hides every clip that is not a car clip. Nothing is moved; switching it off shows them all again.
  // Remembered per campaign.
  const carsKey = `cars-only:${campaignId}`
  const [carsOnly, setCarsOnly] = useState(() => {
    try { return window.localStorage.getItem(carsKey) === "1" }
    catch { return false }
  })
  useEffect(() => {
    try { window.localStorage.setItem(carsKey, carsOnly ? "1" : "0") }
    catch { /* The switch still works for this session if browser storage is unavailable. */ }
  }, [carsKey, carsOnly])
  // The YouTube switch keeps the clips that are public or on the schedule, then the ones that are not: what has
  // gone out, and what is still free to post. Remembered per campaign, and only offered once the schedule is known.
  const youtubeKey = `youtube-filter:${campaignId}`
  const [youtubeChoice, setYouTubeChoice] = useState<YouTubeFilter>(() => {
    try {
      const saved = window.localStorage.getItem(youtubeKey)
      return saved === "on" || saved === "off" ? saved : "all"
    } catch { return "all" }
  })
  useEffect(() => {
    try { window.localStorage.setItem(youtubeKey, youtubeChoice) }
    catch { /* The switch still works for this session if browser storage is unavailable. */ }
  }, [youtubeKey, youtubeChoice])
  const scheduleItems = schedule.data?.items
  const youtube: YouTubeFilter = schedule.data ? youtubeChoice : "all"
  const shown = useMemo(() => (clips.data ?? []).filter((clip) => (!carsOnly || clip.car)
    && (youtube === "all" || Boolean(scheduleFor(clip, scheduleItems)) === (youtube === "on"))),
  [clips.data, carsOnly, youtube, scheduleItems])
  const filtered = carsOnly || youtube !== "all"

  const paged = usePagination(shown, CLIPS_PER_PAGE, `${campaignId}:${carsOnly ? "cars" : "all"}:${youtube}`)
  // A finished re-render replaces the file, so the path we opened disappears. Fall back to the clip
  // with the same title - the replacement - rather than snapping the dialog shut mid-review.
  const open = clips.data?.find((clip) => clip.relativePath === openPath)
    ?? (openTitle ? clips.data?.find((clip) => clip.title === openTitle) : undefined)
    ?? null

  const copyFolder = async () => {
    const first = clips.data?.[0]
    if (!first) return
    const folder = first.relativePath.replace(/[\\/][^\\/]+$/, "")
    try {
      await navigator.clipboard.writeText(folder)
      toast.success("Folder path copied")
    } catch {
      toast.error("Could not copy the path.")
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <CardTitle>Rendered clips</CardTitle>
            {clips.data?.length ? <Badge variant="success">{filtered ? `${shown.length} of ${clips.data.length}` : clips.data.length}</Badge> : null}
            {watching ? <Badge variant="warning">{Object.keys(renderJobs).length} re-rendering</Badge> : null}
          </div>
          <CardDescription>Every finished edit in this campaign. Click one to play it, swap its song or re-cut the mix.</CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {clips.data?.length ? (
            <Button variant={carsOnly ? "brand" : "outline"} size="sm" aria-pressed={carsOnly} onClick={() => setCarsOnly((current) => !current)}
              title={carsOnly ? "Showing car clips only. Click to show every clip." : "Hide every clip that is not a car clip."}>
              <CarFront /> Cars only
            </Button>
          ) : null}
          {clips.data?.length && schedule.data ? (
            <Button variant={youtube === "all" ? "outline" : "brand"} size="sm" aria-pressed={youtube !== "all"}
              onClick={() => setYouTubeChoice((current) => current === "all" ? "on" : current === "on" ? "off" : "all")}
              title={youtube === "all" ? "Show only the clips that are public or scheduled on YouTube."
                : youtube === "on" ? "Showing clips that are public or scheduled on YouTube. Click to show the ones that are not."
                : "Showing clips that are not on YouTube yet. Click to show every clip."}>
              <SquarePlay /> {youtube === "off" ? "Not on YouTube" : "On YouTube"}
            </Button>
          ) : null}
          {/* Works on the clips in view, so nothing hidden by a filter is moved unseen. */}
          {clips.data?.length ? <MoveAllToDrive campaignId={campaignId} clips={shown} schedule={schedule.data} busyPlans={busyPlans} /> : null}
          {clips.data?.length ? <Button variant="ghost" size="icon" aria-label="Copy output folder path" onClick={copyFolder}><Copy /></Button> : null}
          <Button variant="ghost" size="icon" aria-label="Refresh clips"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })}>
            <RefreshCw className={clips.isFetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {schedule.data ? <CampaignYouTubePage campaignId={campaignId} schedule={schedule.data} /> : null}
        <DefaultVolumes campaignId={campaignId} editStyle={editStyle} />
        {clips.isLoading ? (
          <p className="py-6 text-center text-sm text-[var(--fg-muted)]">Loading clips...</p>
        ) : clips.data?.length && shown.length === 0 && youtube !== "all" ? (
          <EmptyState
            title={youtube === "on" ? "Nothing on YouTube yet" : "Every clip here is on YouTube"}
            description={`${youtube === "on" ? "No clip is public or scheduled" : "No clip is left to post"}${carsOnly ? " among the car clips" : ""}. Click the YouTube button again to see other clips.`}
            icon={<SquarePlay className="size-6" />}
          />
        ) : clips.data?.length && shown.length === 0 ? (
          <EmptyState
            title="No car clips here"
            description="A clip counts when its title or caption names a car, or when you mark it with the car button on its tile. Turn off Cars only to see every clip."
            icon={<CarFront className="size-6" />}
          />
        ) : clips.data?.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {paged.items.map((clip) => (
                <ClipTile
                  key={clip.relativePath}
                  campaignId={campaignId}
                  clip={clip}
                  job={clip.editPlanId ? jobById.get(renderJobs[clip.editPlanId]) ?? jobById.get(repairJobs[clip.editPlanId]) : undefined}
                  schedule={schedule.data}
                  scheduled={scheduleFor(clip, schedule.data?.items)}
                  onOpen={() => { setOpenPath(clip.relativePath); setOpenTitle(clip.title ?? null) }}
                />
              ))}
            </div>
            <Pagination className="px-0 pb-0" page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPageChange={paged.setPage} noun="clips" />
          </>
        ) : (
          <EmptyState
            title="No rendered clips yet"
            description="Approve an edit plan and run a render. Finished videos show up here, ready to play."
            icon={<Clapperboard className="size-6" />}
          />
        )}
      </CardContent>

      <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) { setOpenPath(null); setOpenTitle(null) } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">{open?.title || open?.fileName}</DialogTitle>
          </DialogHeader>
          {open ? (
            <ClipDetail
              key={open.relativePath}
              campaignId={campaignId}
              clip={open}
              defaultVoice={editStyle?.voiceVolume ?? 1}
              defaultMusic={editStyle?.musicVolume ?? 0.2}
              musicLocationId={editStyle?.musicLocationId}
              excludedMusic={editStyle?.excludedMusic}
              job={open.editPlanId ? jobById.get(renderJobs[open.editPlanId]) : undefined}
              repairJob={open.editPlanId ? jobById.get(repairJobs[open.editPlanId]) : undefined}
              schedule={schedule.data}
              onRerender={(planId, jobId) => setRenderJobs((current) => ({ ...current, [planId]: jobId }))}
              onRepair={(planId, jobId) => setRepairJobs((current) => ({ ...current, [planId]: jobId }))}
              onRepairApplied={(planId) => setRepairJobs((current) => {
                const next = { ...current }; delete next[planId]; return next
              })}
              onClose={() => { setOpenPath(null); setOpenTitle(null) }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
