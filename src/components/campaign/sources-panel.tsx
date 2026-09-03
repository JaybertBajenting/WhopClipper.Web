import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Download, ExternalLink, FileVideo, Link2, LoaderCircle, Play, PlayCircle, ShieldCheck, Subtitles, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { api, getErrorMessage } from "@/lib/api"
import type { CampaignDetail, SourceAsset } from "@/lib/types"
import { usePagination } from "@/lib/pagination"
import { formatBytes, formatDuration } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DetectedLinksCard } from "@/components/campaign/detected-links-card"
import { LocalSourcesCard } from "@/components/campaign/local-sources-card"
import { EmptyState, FieldError, Pagination } from "@/components/page"

const sourceSchema = z.object({ url: z.url("Enter a valid source URL."), permission: z.boolean().refine(Boolean, "Confirm you are allowed to use this source.") })
type SourceValues = z.infer<typeof sourceSchema>

const SOURCES_PER_PAGE = 20

/**
 * Whether this source is work still to do. A known duration is the proof that yt-dlp resolved the
 * URL to one video: campaigns collect the brand's channel and profile links as sources too, and
 * those must never be handed to the downloader as though they were VODs.
 *
 * The per-source button and the "Process all" count both read this. Two copies would drift, and
 * then the button would offer work on a source the count calls done.
 */
function processBlockedReason(campaign: CampaignDetail, source: SourceAsset): string | null {
  // A known duration proves it, and so does a video content type: a Google Drive file reports its
  // type long before anything measures its duration, and testing duration alone would leave every
  // Drive source permanently unprocessable.
  if (!source.isVideo)
    return "Not confirmed to be a single video yet. Inspect it first — channel and profile links cannot be processed."
  if ((campaign.editPlans ?? []).some((plan) => plan.sourceAssetId === source.id))
    return "This source already has clips."
  return null
}

function SourceCard({ campaign, source }: { campaign: CampaignDetail; source: SourceAsset }) {
  const campaignId = campaign.id
  const queryClient = useQueryClient()
  const download = useMutation({ mutationFn: () => api.downloadSource(campaignId, source.id), onSuccess: () => { toast.success("Download queued"); queryClient.invalidateQueries({ queryKey: ["jobs"] }); queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const process = useMutation({
    mutationFn: () => api.startSourcePipeline(campaignId, source.id),
    onSuccess: () => {
      toast.success("Queued: download, highlights, clips, then the video is deleted")
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteSource(campaignId, source.id),
    onSuccess: (result) => {
      toast.success(`Source removed${result.editPlansRemoved ? `, ${result.editPlansRemoved} edit plan(s) too` : ""}`)
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "detected-links"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const downloaded = source.status === "Downloaded" || Boolean(source.localPath)
  const blocked = processBlockedReason(campaign, source)
  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--border-default)] bg-panel p-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-muted)]">
        {source.thumbnailUrl ? <img className="h-full w-full object-cover" src={source.thumbnailUrl} alt="" /> : <FileVideo className="size-8 text-[var(--fg-muted)]" />}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{formatDuration(source.durationSeconds)}</span>
      </div>
      <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant={downloaded ? "success" : source.status === "Failed" ? "destructive" : "secondary"}>{source.status || "Added"}</Badge>{source.hasTranscript && <Badge variant="default"><Subtitles /> Transcript</Badge>}</div><h3 className="truncate text-sm font-semibold text-ink">{source.title || source.url}</h3><p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{source.uploader || "Remote source"} {source.format ? `· ${source.format}` : ""} {source.fileSizeBytes ? `· ${formatBytes(source.fileSizeBytes)}` : ""}</p>{source.localPath && <p className="mt-2 truncate font-mono text-[10px] text-[var(--fg-muted)]" title={source.localPath}>{source.localPath}</p>}</div>
      <div className="flex gap-2 md:flex-col"><Button variant="brand" title={blocked ?? "Download, find highlights, render the clips, then delete the video."} disabled={Boolean(blocked) || process.isPending} onClick={() => process.mutate()}>{process.isPending ? <LoaderCircle className="animate-spin" /> : <Play />} Process this source</Button>{source.isLocalFile ? <Badge variant="secondary">Local file</Badge> : <Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending}><Download /> {download.isPending ? "Queuing…" : downloaded ? "Refresh" : "Download"}</Button>}{source.url ? <Button variant="ghost" asChild><a href={source.url} target="_blank" rel="noreferrer"><ExternalLink /> Source</a></Button> : null}<Button variant="ghost" size="icon" aria-label={`Remove ${source.title}`} title="Remove from campaign (the downloaded file is kept)" onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 /></Button></div>
    </div>
  )
}

export function SourcesPanel({ campaign }: { campaign: CampaignDetail }) {
  const queryClient = useQueryClient()
  const form = useForm<SourceValues>({ resolver: zodResolver(sourceSchema), defaultValues: { url: "", permission: false } })
  const inspect = useMutation({ mutationFn: (values: SourceValues) => api.inspectSource(campaign.id, values.url), onSuccess: () => { toast.success("Source added; metadata inspection queued"); form.reset(); queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] }); queryClient.invalidateQueries({ queryKey: ["jobs"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const autoRun = useMutation({
    mutationFn: () => api.autoRunCampaign(campaign.id),
    onSuccess: (result) => {
      if (result.queued.length === 0) toast.info(result.skipped > 0 ? "Every source already has clips" : "No sources to process yet")
      else toast.success(`Queued ${result.queued.length} source${result.queued.length === 1 ? "" : "s"}${result.skipped > 0 ? `, skipped ${result.skipped} already done` : ""}`)
      queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  // The button says how many it will take on, because each is a multi-gigabyte download and an
  // analysis. Same rule as the per-source button, so the two can never disagree.
  const outstanding = campaign.sources.filter((source) => processBlockedReason(campaign, source) === null)
  const paged = usePagination(campaign.sources ?? [], SOURCES_PER_PAGE, campaign.id)
  return (
    <div className="space-y-5">
      <Alert tone="warning"><span className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>Only download source media supplied or approved for this campaign. Whop Clipper does not bypass access controls, DRM, or paywalls.</span></span></Alert>
      <DetectedLinksCard campaignId={campaign.id} target="source" />

      <Card>
        <CardHeader>
          <CardTitle>Process all sources</CardTitle>
          <CardDescription>Downloads each source, finds its highlights, renders the clips, then deletes the video before starting the next one. Sources that already have clips are skipped.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="brand" disabled={autoRun.isPending || outstanding.length === 0} onClick={() => autoRun.mutate()}>
              {autoRun.isPending ? <LoaderCircle className="animate-spin" /> : <PlayCircle />} Process {outstanding.length} source{outstanding.length === 1 ? "" : "s"}
            </Button>
            <span className="text-xs text-[var(--fg-muted)]">{campaign.sources.length - outstanding.length} of {campaign.sources.length} already have clips</span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--fg-muted)]">Runs one source at a time so only one video is ever on disk. A source that will not fit, or whose analysis keeps being rate limited, fails on its own and the rest carry on. Deleting the video means re-rendering its clips later needs a fresh download.</p>
        </CardContent>
      </Card>

      <LocalSourcesCard campaignId={campaign.id} />

      <Card>
        <CardHeader><CardTitle>Add a source URL</CardTitle><CardDescription>For anything the brief did not list. Metadata is inspected with yt-dlp before anything is downloaded.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => inspect.mutate(values))}>
            <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" /><Input className="pl-9" placeholder="https://youtube.com/watch?v=…" {...form.register("url")} /></div><Button type="submit" variant="brand" disabled={inspect.isPending}>{inspect.isPending ? <LoaderCircle className="animate-spin" /> : <Link2 />} Inspect & add</Button></div>
            <FieldError>{form.formState.errors.url?.message}</FieldError>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-[var(--fg-body)]"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand-strong)]" {...form.register("permission")} /><span>I confirm this source is provided by the campaign or I otherwise have permission to download and edit it.</span></label><FieldError>{form.formState.errors.permission?.message}</FieldError>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-[var(--fg-muted)]">Inspection is asynchronous. The source appears below immediately as pending; title, duration, and thumbnail populate when the background job finishes.</p>
        </CardContent>
      </Card>

      <div><div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Campaign sources</h2><span className="text-xs text-[var(--fg-muted)]">{campaign.sources?.length ?? 0} total</span></div>{campaign.sources?.length ? <div className="space-y-3">{paged.items.map((source) => <SourceCard key={source.id} campaign={campaign} source={source} />)}<Pagination className="px-0" page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPageChange={paged.setPage} noun="sources" /></div> : <EmptyState title="No source media" description="Add a campaign-approved URL, inspect it, then download it into this workspace." icon={<FileVideo className="size-6" />} />}</div>
    </div>
  )
}
