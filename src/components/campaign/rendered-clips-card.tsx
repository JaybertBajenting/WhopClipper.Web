import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Clapperboard, Copy, Download, FolderOpen, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage } from "@/lib/api"
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

function ClipTile({ campaignId, clip }: { campaignId: string; clip: RenderedClip }) {
  const src = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}`
  const reveal = useMutation({
    mutationFn: () => api.revealOutput(campaignId, clip.relativePath),
    onSuccess: (result) => { if (!result.revealed) toast.info(result.folder ?? "Could not open the folder.") },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const range = clipRange(clip)
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-raised)]">
      {/* Vertical clips, so the player is constrained rather than letterboxed into a wide box. */}
      <div className="flex justify-center bg-[var(--surface-inverse)] p-2">
        <video
          className="max-h-[420px] w-auto rounded-xl"
          src={src}
          controls
          preload="metadata"
          playsInline
        />
      </div>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">{platformLabels[clip.platform.toLowerCase()] ?? clip.platform}</Badge>
          <span className="text-xs text-[var(--fg-muted)]">{formatBytes(clip.sizeBytes)}</span>
          <span className="text-xs text-[var(--fg-muted)]">· {formatDate(clip.createdAt, true)}</span>
        </div>
        <p className="truncate text-sm font-semibold text-ink" title={clip.fileName}>{clip.fileName}</p>
        {range && <p className="text-xs text-[var(--fg-muted)]">{range}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
            <FolderOpen /> Show in folder
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={src} download={clip.fileName}><Download /> Save a copy</a>
          </Button>
        </div>
      </div>
    </div>
  )
}

export function RenderedClipsCard({ campaignId }: { campaignId: string }) {
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
              {paged.items.map((clip) => <ClipTile key={clip.relativePath} campaignId={campaignId} clip={clip} />)}
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
