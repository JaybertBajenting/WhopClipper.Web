import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Clapperboard, Copy, Download, Film, FolderOpen, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage } from "@/lib/api"
import { describeClipStyle } from "@/lib/edit-style"
import type { RenderedClip } from "@/lib/types"
import { usePagination } from "@/lib/pagination"
import { formatBytes, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, Pagination } from "@/components/page"

// Small on purpose. Every tile mounts a <video preload="metadata">, so the page size is the
// number of simultaneous requests this card fires at the local API when the tab opens.
const CLIPS_PER_PAGE = 12

const platformLabels: Record<string, string> = {
  tiktok: "TikTok",
  "instagram-reels": "Instagram Reels",
  instagramreels: "Instagram Reels",
  "youtube-shorts": "YouTube Shorts",
  youtubeshorts: "YouTube Shorts",
  x: "X",
}

function clipRange(clip: RenderedClip) {
  if (clip.startSeconds == null || clip.endSeconds == null) return null
  const stamp = (value: number) => {
    const minutes = Math.floor(value / 60)
    const seconds = Math.floor(value % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }
  return `${stamp(clip.startSeconds)}–${stamp(clip.endSeconds)} of source`
}


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
        ? <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-subtle)] p-2.5 font-sans text-xs leading-relaxed text-[var(--fg-strong)]">{value}</pre>
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
        {described.gapCount > 0 && <Badge variant="warning">Incomplete B-roll — needs repair</Badge>}
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
          <li key={`gap-${gap.atSeconds}`}>Missing required footage at {gap.atSeconds.toFixed(1)}–{(gap.atSeconds + gap.durationSeconds).toFixed(1)}s for “{gap.query}”: {gap.reason}</li>
        ))}
      </ul>
    </details>
  )
}

const pct = (value: number) => `${Math.round(value * 100)}%`

function ClipTile({ campaignId, clip, defaultVoice, defaultMusic }: { campaignId: string; clip: RenderedClip; defaultVoice: number; defaultMusic: number }) {
  const queryClient = useQueryClient()
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}`
  // Start from this clip's own volumes if it has them, otherwise the campaign default.
  const [voice, setVoice] = useState(clip.style?.voiceVolume ?? defaultVoice)
  const [music, setMusic] = useState(clip.style?.musicVolume ?? defaultMusic)
  const reveal = useMutation({
    mutationFn: () => api.revealOutput(campaignId, clip.relativePath),
    onSuccess: (result) => { if (!result.revealed) toast.info(result.folder ?? "Could not open the folder.") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const rerender = useMutation({
    mutationFn: () => api.rerenderClip(clip.editPlanId!, { voiceVolume: voice, musicVolume: music }),
    onSuccess: () => {
      toast.success("Re-rendering this clip with your voice and music levels. It replaces this clip when done.")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "jobs"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  // Live preview: play the music-free companion + the song as a separate track, mixed by the sliders.
  const preview = useQuery({
    queryKey: ["clip-preview", clip.editPlanId],
    queryFn: () => api.clipPreview(clip.editPlanId!),
    enabled: Boolean(clip.editPlanId && clip.style),
  })
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
  }, [voice, music, canLiveMix])
  const range = clipRange(clip)
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)]">
      {/* Vertical clips, so the player is constrained rather than letterboxed into a wide box. */}
      <div className="flex justify-center bg-[var(--surface-inverse)] p-2">
        <video
          ref={videoRef}
          className="max-h-[420px] w-auto rounded-xl"
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
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{platformLabels[clip.platform.toLowerCase()] ?? clip.platform}</Badge>
          <span className="text-xs text-[var(--fg-muted)]">{formatBytes(clip.sizeBytes)}</span>
          <span className="text-xs text-[var(--fg-muted)]">· {formatDate(clip.createdAt, true)}</span>
        </div>
        {clip.title ? <CopyField label="Title" value={clip.title} /> : null}
        {clip.caption ? <CopyField label="Caption" value={clip.caption} multiline /> : null}
        <p className="truncate font-mono text-[10px] text-[var(--fg-muted)]" title={clip.fileName}>{clip.fileName}</p>
        {range && <p className="text-xs text-[var(--fg-muted)]">{range}</p>}
        <ClipFootage clip={clip} />
        {clip.style && clip.editPlanId ? (
          <div className="space-y-2 rounded-lg bg-[var(--surface-subtle)] p-2.5">
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor={`voice-${clip.editPlanId}`}>
                <span>Podcast voice</span><span>{pct(voice)}</span>
              </label>
              <input id={`voice-${clip.editPlanId}`} type="range" min={50} max={200} value={Math.round(voice * 100)} className="w-full"
                onChange={(event) => setVoice(Number(event.target.value) / 100)} />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor={`music-${clip.editPlanId}`}>
                <span>Music</span><span>{pct(music)}</span>
              </label>
              <input id={`music-${clip.editPlanId}`} type="range" min={0} max={60} value={Math.round(music * 100)} className="w-full"
                onChange={(event) => setMusic(Number(event.target.value) / 100)} />
            </div>
            <p className="text-[10px] text-[var(--fg-muted)]">
              {canLiveMix
                ? "Play the clip and drag — you hear the balance change live (approximate). Re-render to bake it in."
                : "Re-render to apply these levels (live preview is available after the next re-render)."}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
            <FolderOpen /> Show in folder
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={src} download={clip.fileName}><Download /> Save a copy</a>
          </Button>
          {clip.style && clip.editPlanId ? (
            <Button variant="outline" size="sm" onClick={() => rerender.mutate()} disabled={rerender.isPending}>
              <RefreshCw className={rerender.isPending ? "animate-spin" : undefined} /> Re-render
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function RenderedClipsCard({ campaignId, defaultVoice = 1, defaultMusic = 0.2 }: { campaignId: string; defaultVoice?: number; defaultMusic?: number }) {
  const queryClient = useQueryClient()
  const clips = useQuery({
    queryKey: ["campaign", campaignId, "outputs"],
    queryFn: () => api.renderedClips(campaignId),
    refetchInterval: 20_000,
  })
  const paged = usePagination(clips.data ?? [], CLIPS_PER_PAGE, campaignId)

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
          <CardDescription>Every finished edit in this campaign. Play them here before you upload.</CardDescription>
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paged.items.map((clip) => <ClipTile key={clip.relativePath} campaignId={campaignId} clip={clip} defaultVoice={defaultVoice} defaultMusic={defaultMusic} />)}
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
    </Card>
  )
}
