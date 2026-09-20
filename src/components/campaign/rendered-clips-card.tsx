import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Clapperboard, Copy, Download, Film, FolderOpen, Music, Play, RefreshCw, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage } from "@/lib/api"
import { describeClipStyle } from "@/lib/edit-style"
import type { CampaignEditStyle, Job, RenderedClip } from "@/lib/types"
import { usePagination } from "@/lib/pagination"
import { formatBytes, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, Pagination } from "@/components/page"

// Each tile mounts a <video preload="metadata">, so the page size is the number of simultaneous
// requests this card fires at the local API. The heavy player only mounts for the open clip.
const CLIPS_PER_PAGE = 12

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

/** Progress for one clip's re-render, shown wherever that clip appears. */
function RerenderProgress({ job }: { job: Job }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="size-3.5 animate-spin" />
          {job.status === "Queued" ? "Waiting for a slot..." : "Re-rendering..."}
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
function ClipTile({ campaignId, clip, job, onOpen }: { campaignId: string; clip: RenderedClip; job?: Job; onOpen: () => void }) {
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}`
  const gaps = clip.style?.gaps?.length ?? 0
  const length = clipLength(clip)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-left transition hover:border-[var(--border-strong)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <div className="relative aspect-[9/16] max-h-64 w-full overflow-hidden bg-[var(--surface-inverse)]">
        <video className="size-full object-cover" src={src} preload="metadata" muted playsInline tabIndex={-1} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover:opacity-100">
          <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-ink shadow"><Play className="size-5" /></span>
        </div>
        {job ? (
          <span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold text-white">
            <RefreshCw className="size-3 animate-spin" />
            {job.status === "Queued" ? "Queued" : `Re-rendering ${Math.round(job.progress ?? 0)}%`}
          </span>
        ) : (
          <>
            {gaps > 0 && (
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[var(--warning-solid,#b45309)] px-2 py-0.5 text-[10px] font-semibold text-white">
                <AlertTriangle className="size-3" /> B-roll
              </span>
            )}
            {length && (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">{length}</span>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--fg-strong)]">{clip.title || clip.fileName}</p>
        <p className="text-[11px] text-[var(--fg-muted)]">
          {platformLabels[clip.platform.toLowerCase()] ?? clip.platform} · {formatBytes(clip.sizeBytes)}
        </p>
      </div>
    </button>
  )
}

/** Everything you can play, tune or re-cut for one clip. Mounted only while its tile is open. */
function ClipDetail({
  campaignId, clip, defaultVoice, defaultMusic, musicLocationId, excludedMusic, job, onRerender, onClose,
}: {
  campaignId: string; clip: RenderedClip; defaultVoice: number; defaultMusic: number
  musicLocationId?: string | null; excludedMusic?: string[] | null
  job?: Job; onRerender: (editPlanId: string, jobId: string) => void; onClose: () => void
}) {
  const queryClient = useQueryClient()
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}`
  const [voice, setVoice] = useState(clip.style?.voiceVolume ?? defaultVoice)
  const [music, setMusic] = useState(clip.style?.musicVolume ?? defaultMusic)
  // Set once the bed or the levels differ from what is baked into the file on disk.
  const [dirty, setDirty] = useState(false)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)

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
      toast.success("Song set. Play it here to hear it, then re-render to bake it into the file.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const rerender = useMutation({
    mutationFn: () => api.rerenderClip(clip.editPlanId!, { voiceVolume: voice, musicVolume: music }),
    onSuccess: (started) => { setDirty(false); onRerender(clip.editPlanId!, started.id) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const running = Boolean(job) || rerender.isPending

  const companion = preview.data?.previewRelativePath
  const musicUrl = preview.data?.musicAssetId ? api.musicFileUrl(preview.data.musicAssetId) : null
  const musicStart = preview.data?.musicStartSeconds ?? 0
  const canLiveMix = Boolean(companion && musicUrl)
  const videoSrc = companion
    ? `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(companion)}`
    : src
  // Sliders drive the elements directly, so the balance changes while it plays - no re-render.
  useEffect(() => {
    if (!canLiveMix) return
    if (videoEl) videoEl.volume = Math.min(1, voice)
    if (audioEl) audioEl.volume = Math.min(1, music)
  }, [voice, music, canLiveMix, musicUrl, videoEl, audioEl])
  const range = clipRange(clip)
  const tunable = Boolean(clip.style && clip.editPlanId)

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex justify-center rounded-xl bg-[var(--surface-inverse)] p-2">
          <video
            ref={setVideoEl}
            className="max-h-[52vh] w-auto rounded-lg"
            src={videoSrc}
            controls
            preload="metadata"
            playsInline
            onPlay={() => {
              if (canLiveMix && audioEl) {
                audioEl.currentTime = musicStart
                audioEl.volume = Math.min(1, music)
                void audioEl.play().catch(() => {})
              }
            }}
            onPause={() => audioEl?.pause()}
            onEnded={() => audioEl?.pause()}
            onSeeked={() => { if (canLiveMix && audioEl && videoEl) audioEl.currentTime = musicStart + videoEl.currentTime }}
          />
          {canLiveMix && musicUrl ? <audio ref={setAudioEl} src={musicUrl} loop preload="auto" /> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
            <FolderOpen /> Show in folder
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={src} download={clip.fileName}><Download /> Save a copy</a>
          </Button>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
          <Badge variant="default">{platformLabels[clip.platform.toLowerCase()] ?? clip.platform}</Badge>
          <span>{formatBytes(clip.sizeBytes)}</span>
          <span>· {formatDate(clip.createdAt, true)}</span>
          {range && <span>· {range}</span>}
        </div>

        {tunable ? (
          <div className="space-y-3 rounded-xl border border-[var(--border-default)] p-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--fg-muted)]" htmlFor={`song-${clip.editPlanId}`}>
                <Music className="size-3.5" /> Song
              </label>
              <Select
                value={preview.data?.musicAssetId ?? undefined}
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
                Each song enters at its own marked segment. Not the right pick? Choose another and press play.
              </p>
            </div>

            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor={`voice-${clip.editPlanId}`}>
                <span>Podcast voice</span><span className="tabular-nums">{pct(voice)}</span>
              </label>
              <input id={`voice-${clip.editPlanId}`} type="range" min={50} max={200} value={Math.round(voice * 100)} className="w-full"
                onChange={(event) => { setVoice(Number(event.target.value) / 100); setDirty(true) }} />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor={`music-${clip.editPlanId}`}>
                <span>Music</span><span className="tabular-nums">{pct(music)}</span>
              </label>
              <input id={`music-${clip.editPlanId}`} type="range" min={0} max={60} value={Math.round(music * 100)} className="w-full"
                onChange={(event) => { setMusic(Number(event.target.value) / 100); setDirty(true) }} />
            </div>

            <p className="text-[10px] text-[var(--fg-muted)]">
              {canLiveMix
                ? "Play the clip and drag - you hear the balance change live (approximate). Re-render to bake it in."
                : "Re-render to apply these levels (live preview appears after the next re-render)."}
            </p>

            {job ? <RerenderProgress job={job} /> : (
              <Button className="w-full" variant={dirty ? "default" : "outline"} size="sm"
                disabled={rerender.isPending} onClick={() => rerender.mutate()}>
                <RefreshCw className={rerender.isPending ? "animate-spin" : undefined} />
                {dirty ? "Re-render with these changes" : "Re-render"}
              </Button>
            )}
          </div>
        ) : null}

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
  const watching = Object.keys(renderJobs).length > 0

  const clips = useQuery({
    queryKey: ["campaign", campaignId, "outputs"],
    queryFn: () => api.renderedClips(campaignId),
    refetchInterval: 20_000,
  })
  // One poll covers every clip being re-rendered at once.
  const jobs = useQuery({
    queryKey: ["campaign", campaignId, "rerender-jobs"],
    queryFn: () => api.jobs(40),
    enabled: watching,
    refetchInterval: watching ? 1500 : false,
  })
  const jobById = useMemo(() => new Map((jobs.data ?? []).map((job) => [job.id, job])), [jobs.data])

  useEffect(() => {
    const finished = Object.entries(renderJobs).filter(([, jobId]) => isTerminal(jobById.get(jobId)?.status))
    if (finished.length === 0) return
    for (const [, jobId] of finished) {
      const job = jobById.get(jobId)!
      if (job.status === "Completed") toast.success("Re-render finished. It replaced the older cut of this clip.")
      else if (job.status === "Failed") toast.error(job.errorSummary || "The re-render failed. The older cut was kept.")
    }
    setRenderJobs((current) => {
      const next = { ...current }
      for (const [planId] of finished) delete next[planId]
      return next
    })
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
    queryClient.invalidateQueries({ queryKey: ["clip-preview"] })
  }, [jobById, renderJobs, campaignId, queryClient])

  const paged = usePagination(clips.data ?? [], CLIPS_PER_PAGE, campaignId)
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
            {clips.data?.length ? <Badge variant="success">{clips.data.length}</Badge> : null}
            {watching ? <Badge variant="warning">{Object.keys(renderJobs).length} re-rendering</Badge> : null}
          </div>
          <CardDescription>Every finished edit in this campaign. Click one to play it, swap its song or re-cut the mix.</CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {clips.data?.length ? <Button variant="ghost" size="icon" aria-label="Copy output folder path" onClick={copyFolder}><Copy /></Button> : null}
          <Button variant="ghost" size="icon" aria-label="Refresh clips"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })}>
            <RefreshCw className={clips.isFetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DefaultVolumes campaignId={campaignId} editStyle={editStyle} />
        {clips.isLoading ? (
          <p className="py-6 text-center text-sm text-[var(--fg-muted)]">Loading clips...</p>
        ) : clips.data?.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {paged.items.map((clip) => (
                <ClipTile
                  key={clip.relativePath}
                  campaignId={campaignId}
                  clip={clip}
                  job={clip.editPlanId ? jobById.get(renderJobs[clip.editPlanId]) : undefined}
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
              onRerender={(planId, jobId) => setRenderJobs((current) => ({ ...current, [planId]: jobId }))}
              onClose={() => { setOpenPath(null); setOpenTitle(null) }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
