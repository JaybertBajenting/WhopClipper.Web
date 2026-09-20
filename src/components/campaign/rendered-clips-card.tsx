import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Clapperboard, Copy, Download, Film, FolderOpen, Music, Play, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage } from "@/lib/api"
import { describeClipStyle } from "@/lib/edit-style"
import type { RenderedClip } from "@/lib/types"
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
          <li key={`gap-${gap.atSeconds}`}>Missing footage at {gap.atSeconds.toFixed(1)}–{(gap.atSeconds + gap.durationSeconds).toFixed(1)}s for “{gap.query}”: {gap.reason}</li>
        ))}
      </ul>
    </details>
  )
}

/**
 * The compact grid tile: a poster, the title and the few facts worth scanning. Everything you can
 * change lives in the detail dialog, so a page of twelve stays readable.
 */
function ClipTile({ campaignId, clip, onOpen }: { campaignId: string; clip: RenderedClip; onOpen: () => void }) {
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
        {gaps > 0 && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[var(--warning-solid,#b45309)] px-2 py-0.5 text-[10px] font-semibold text-white">
            <AlertTriangle className="size-3" /> B-roll
          </span>
        )}
        {length && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">{length}</span>
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
  campaignId, clip, defaultVoice, defaultMusic, musicLocationId, excludedMusic, onClose,
}: {
  campaignId: string; clip: RenderedClip; defaultVoice: number; defaultMusic: number
  musicLocationId?: string | null; excludedMusic?: string[] | null; onClose: () => void
}) {
  const queryClient = useQueryClient()
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}`
  const [voice, setVoice] = useState(clip.style?.voiceVolume ?? defaultVoice)
  const [music, setMusic] = useState(clip.style?.musicVolume ?? defaultMusic)
  // Set once the bed or the levels differ from what is baked into the file on disk.
  const [dirty, setDirty] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

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
    onSuccess: (job) => setJobId(job.id),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  // A re-render runs on the server, so poll its job: without this there is no way to tell it finished.
  const job = useQuery({
    queryKey: ["clip-job", jobId],
    queryFn: () => api.job(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: 1500,
  })
  const status = job.data?.status
  useEffect(() => {
    if (!jobId || !isTerminal(status)) return
    if (status === "Completed") {
      // A re-render builds a fresh clip rather than overwriting this one, so say so: the old cut is
      // still in the list and picking the wrong one to upload would be easy otherwise.
      toast.success("Re-render finished. It was added as a new clip — the older cut is still in the list.")
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
      queryClient.invalidateQueries({ queryKey: ["clip-preview", clip.editPlanId] })
    } else if (status === "Failed") toast.error(job.data?.errorSummary || "The re-render failed.")
    setJobId(null)
  }, [jobId, status, job.data?.errorSummary, campaignId, clip.editPlanId, queryClient])
  const running = Boolean(jobId) || rerender.isPending

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
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
    if (videoRef.current) videoRef.current.volume = Math.min(1, voice)
    if (audioRef.current) audioRef.current.volume = Math.min(1, music)
  }, [voice, music, canLiveMix, musicUrl])
  const range = clipRange(clip)
  const tunable = Boolean(clip.style && clip.editPlanId)

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex justify-center rounded-xl bg-[var(--surface-inverse)] p-2">
          <video
            ref={videoRef}
            className="max-h-[52vh] w-auto rounded-lg"
            src={videoSrc}
            controls
            preload="metadata"
            playsInline
            onPlay={() => { if (canLiveMix && audioRef.current) { audioRef.current.currentTime = musicStart; audioRef.current.volume = Math.min(1, music); void audioRef.current.play().catch(() => {}) } }}
            onPause={() => audioRef.current?.pause()}
            onEnded={() => { if (audioRef.current) audioRef.current.pause() }}
            onSeeked={() => { if (canLiveMix && audioRef.current) audioRef.current.currentTime = musicStart + (videoRef.current?.currentTime ?? 0) }}
          />
          {canLiveMix && musicUrl ? <audio ref={audioRef} src={musicUrl} loop preload="auto" /> : null}
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
                  <SelectValue placeholder={assets.isLoading ? "Loading songs…" : "Pick a song"} />
                </SelectTrigger>
                <SelectContent>
                  {songs.map((song) => <SelectItem key={song.id} value={song.id}>{song.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
                Each song enters at its own marked segment. Don’t like the pick? Choose another and press play.
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
                ? "Play the clip and drag — you hear the balance change live (approximate). Re-render to bake it in."
                : "Re-render to apply these levels (live preview appears after the next re-render)."}
            </p>

            {running ? (
              <div className="space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="size-3.5 animate-spin" />
                    {status === "Queued" ? "Waiting for a slot…" : "Re-rendering…"}
                  </span>
                  <span className="tabular-nums">{Math.round(job.data?.progress ?? 0)}%</span>
                </div>
                <Progress value={job.data?.progress ?? 0} />
                <p className="text-[10px] text-[var(--fg-muted)]">This takes a couple of minutes. You can keep working.</p>
              </div>
            ) : (
              <Button className="w-full" variant={dirty ? "default" : "outline"} size="sm" onClick={() => rerender.mutate()}>
                <RefreshCw /> {dirty ? "Re-render with these changes" : "Re-render"}
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

export function RenderedClipsCard({ campaignId, defaultVoice = 1, defaultMusic = 0.2, musicLocationId, excludedMusic }: {
  campaignId: string; defaultVoice?: number; defaultMusic?: number
  musicLocationId?: string | null; excludedMusic?: string[] | null
}) {
  const queryClient = useQueryClient()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const clips = useQuery({
    queryKey: ["campaign", campaignId, "outputs"],
    queryFn: () => api.renderedClips(campaignId),
    refetchInterval: 20_000,
  })
  const paged = usePagination(clips.data ?? [], CLIPS_PER_PAGE, campaignId)
  const open = clips.data?.find((clip) => clip.relativePath === openPath) ?? null

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
        {clips.isLoading ? (
          <p className="py-6 text-center text-sm text-[var(--fg-muted)]">Loading clips…</p>
        ) : clips.data?.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {paged.items.map((clip) => (
                <ClipTile key={clip.relativePath} campaignId={campaignId} clip={clip} onOpen={() => setOpenPath(clip.relativePath)} />
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

      <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpenPath(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">{open?.title || open?.fileName}</DialogTitle>
          </DialogHeader>
          {open ? (
            <ClipDetail
              key={open.relativePath}
              campaignId={campaignId}
              clip={open}
              defaultVoice={defaultVoice}
              defaultMusic={defaultMusic}
              musicLocationId={musicLocationId}
              excludedMusic={excludedMusic}
              onClose={() => setOpenPath(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
