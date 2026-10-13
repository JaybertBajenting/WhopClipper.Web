import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Ban, Check, CheckCircle2, CircleAlert, Clipboard, Download, ExternalLink, Film, FolderOpen, LoaderCircle, RefreshCw, Send, Upload, XCircle } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage, manualPublishingPackageUrl } from "@/lib/api"
import { copyText, publishingPlatformLabels, publishingPlatforms, publishStatusLabels } from "@/lib/publishing"
import type { CampaignSummary, PlatformGuide, PublishingConnectionStatus, PublishingPlatform, PublishJob, PublishPrivacy, RenderedClip } from "@/lib/types"
import { useYouTubeSchedule } from "@/components/publishing/youtube-schedule-panel"
import { formatBytes, formatDate } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState } from "@/components/page"

const activeStatuses = new Set(["Queued", "Validating", "Uploading", "Processing"])
const cancellableStatuses = new Set(["Queued", "AwaitingFinalConfirmation", "RequiresManualAction"])
const platformAction: Record<PublishingPlatform, string> = { TikTok: "Prepare manual package", InstagramReels: "Upload Reel", YouTubeShorts: "Upload Short" }

function PublishStatusBadge({ job }: { job: PublishJob }) {
  const variant = job.status === "Published" ? "success" : job.status === "Failed" ? "destructive" : ["RequiresManualAction", "AwaitingFinalConfirmation", "NeedsAttention"].includes(job.status) ? "warning" : "default"
  return <Badge variant={variant}>{job.status === "Published" ? <CheckCircle2 /> : job.status === "Failed" ? <XCircle /> : activeStatuses.has(job.status) ? <LoaderCircle className="animate-spin" /> : <CircleAlert />}{publishStatusLabels[job.status]}</Badge>
}

function ManualActions({ job, guide }: { job: PublishJob; guide?: PlatformGuide }) {
  const queryClient = useQueryClient()
  const [postUrl, setPostUrl] = useState("")
  const [completed, setCompleted] = useState(false)
  const reveal = useMutation({ mutationFn: () => api.revealOutput(job.campaignId, job.outputRelativePath), onError: (error) => toast.error(getErrorMessage(error)) })
  const complete = useMutation({
    mutationFn: () => api.completeManualPublishingJob(job.id, postUrl.trim()),
    onSuccess: () => { toast.success("Manual TikTok post recorded"); queryClient.invalidateQueries({ queryKey: ["publishing", "jobs", job.campaignId] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const hashtags = job.caption.match(/#[\p{L}\p{N}_]+/gu)?.join(" ") ?? ""
  const copy = async (label: string, value: string) => { try { await copyText(value); toast.success(`${label} copied`) } catch { toast.error("Could not access the clipboard.") } }
  return (
    <div className="mt-4 rounded-xl border border-[var(--border-warning)] bg-[var(--surface-warning-subtle)] p-4">
      <p className="text-sm font-semibold text-ink">Finish this TikTok upload manually</p>
      <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--fg-body)]">{(guide?.uploadInstructions ?? ["Download the handoff ZIP.", "Review the video and copy.", "Upload in TikTok and complete the final checks."]).map((step, index) => <li key={step} className="flex gap-2"><span className="font-bold text-[var(--warning-text)]">{index + 1}.</span>{step}</li>)}</ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild><a href={job.manualPackageDownloadUrl || manualPublishingPackageUrl(job.id)} download><Download /> Download package</a></Button>
        <Button size="sm" variant="outline" onClick={() => copy("Caption", job.caption)}><Clipboard /> Copy caption</Button>
        <Button size="sm" variant="outline" onClick={() => copy("Hashtags", hashtags)} disabled={!hashtags}><Clipboard /> Copy hashtags</Button>
        <Button size="sm" variant="outline" onClick={() => reveal.mutate()} disabled={reveal.isPending}><FolderOpen /> Open video folder</Button>
        <Button size="sm" variant="brand" asChild><a href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer">Open TikTok upload <ExternalLink /></a></Button>
      </div>
      <p className="mt-3 text-xs text-[var(--warning-text)]">Whop Clipper cannot verify the final TikTok post. Confirm the caption, disclosure, audience, and campaign submission yourself.</p>
      <div className="mt-4 space-y-3 border-t border-[var(--border-warning)] pt-4">
        <div><Label htmlFor={`tiktok-post-${job.id}`}>Resulting TikTok post URL</Label><Input id={`tiktok-post-${job.id}`} className="mt-1.5" type="url" value={postUrl} onChange={(event) => { setPostUrl(event.target.value); setCompleted(false) }} placeholder="https://www.tiktok.com/@account/video/…" /></div>
        <label className="flex items-start gap-2 text-xs text-[var(--fg-body)]"><input className="mt-0.5 size-4 accent-[var(--brand-strong)]" type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} /><span>I published this video manually to the account shown above and checked the final post.</span></label>
        <Button size="sm" variant="brand" onClick={() => complete.mutate()} disabled={!completed || !postUrl.trim() || complete.isPending}><CheckCircle2 /> {complete.isPending ? "Recording…" : "Mark manual upload complete"}</Button>
      </div>
    </div>
  )
}

function InstagramFinalActions({ job }: { job: PublishJob }) {
  const queryClient = useQueryClient()
  const [confirmed, setConfirmed] = useState(false)
  const finalKey = useRef(crypto.randomUUID())
  const confirm = useMutation({
    mutationFn: () => api.confirmInstagramPublishingJob(job.id, finalKey.current),
    onSuccess: () => { toast.success("Final Instagram publish queued"); setConfirmed(false); queryClient.invalidateQueries({ queryKey: ["publishing", "jobs", job.campaignId] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return <div className="mt-4 rounded-xl border border-[var(--border-warning)] bg-[var(--surface-warning-subtle)] p-4"><p className="text-sm font-semibold text-ink">The Reel is processed and waiting</p><p className="mt-2 text-xs leading-relaxed text-[var(--fg-body)]">Meta has the video container, but Whop Clipper has not called the final publish operation. Re-check the caption and destination account <strong>{job.accountIdentifier || "shown in Connections"}</strong>.</p><label className="mt-3 flex items-start gap-2 text-xs"><input className="mt-0.5 size-4 accent-[var(--brand-strong)]" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the processed Reel and explicitly approve the final Instagram publish.</span></label><Button className="mt-3" size="sm" variant="brand" disabled={!confirmed || confirm.isPending} onClick={() => confirm.mutate()}><Send /> {confirm.isPending ? "Confirming…" : "Publish Reel now"}</Button></div>
}

function JobRow({ job, guide }: { job: PublishJob; guide?: PlatformGuide }) {
  const queryClient = useQueryClient()
  const cancel = useMutation({ mutationFn: () => api.cancelPublishingJob(job.id), onSuccess: (result) => { toast[result.status === "Cancelled" ? "success" : "warning"](result.status === "Cancelled" ? "Publishing job cancelled" : "The remote operation had already started and was not cancelled."); queryClient.invalidateQueries({ queryKey: ["publishing", "jobs"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const progress = Math.max(0, Math.min(100, job.progress <= 1 ? job.progress * 100 : job.progress))
  return (
    <article className="rounded-2xl border border-[var(--border-default)] bg-panel p-5" aria-label={`${publishingPlatformLabels[job.platform]} ${publishStatusLabels[job.status]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-ink">{job.fileName}</p><PublishStatusBadge job={job} /></div><p className="mt-1 text-xs text-[var(--fg-muted)]">{publishingPlatformLabels[job.platform]} · {job.privacy} · account {job.accountIdentifier || "not recorded"} · started {formatDate(job.createdAt, true)}</p></div>
        {cancellableStatuses.has(job.status) && <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}><Ban /> Cancel</Button>}
        {job.externalUrl && <Button variant="outline" size="sm" asChild><a href={job.externalUrl} target="_blank" rel="noreferrer">View post <ExternalLink /></a></Button>}
      </div>
      {activeStatuses.has(job.status) && <div className="mt-4" aria-live="polite"><div className="mb-1.5 flex justify-between text-xs"><span>{publishStatusLabels[job.status]}</span><span>{Math.round(progress)}%</span></div><Progress value={progress} aria-label={`${publishingPlatformLabels[job.platform]} upload progress`} /></div>}
      {job.error && <Alert className="mt-4" tone="error">{job.error}</Alert>}
      {job.status === "AwaitingFinalConfirmation" && <InstagramFinalActions job={job} />}
      {job.status === "RequiresManualAction" && <ManualActions job={job} guide={guide} />}
    </article>
  )
}

function VideoPicker({ campaignId, clips, value, onChange }: { campaignId: string; clips: RenderedClip[]; value: string; onChange: (value: string) => void }) {
  const selected = clips.find((clip) => clip.relativePath === value)
  const videoUrl = selected ? `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(selected.relativePath)}` : ""
  return (
    <Card>
      <CardHeader><CardTitle>1. Choose a finished video</CardTitle><CardDescription>Only rendered campaign outputs are eligible. Review the clip before sending it anywhere.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div><Label htmlFor="publishing-video">Rendered video</Label><Select value={value} onValueChange={onChange}><SelectTrigger id="publishing-video" className="mt-1.5"><SelectValue placeholder="Choose a rendered clip" /></SelectTrigger><SelectContent>{clips.map((clip) => <SelectItem key={clip.relativePath} value={clip.relativePath}>{clip.fileName} · {formatBytes(clip.sizeBytes)}</SelectItem>)}</SelectContent></Select>{selected && <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[var(--surface-subtle)] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Platform render</p><p className="mt-1 text-xs font-semibold">{selected.platform}</p></div><div className="rounded-xl bg-[var(--surface-subtle)] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Created</p><p className="mt-1 text-xs font-semibold">{formatDate(selected.createdAt, true)}</p></div></div>}</div>
        {selected ? <video className="max-h-72 w-full rounded-xl bg-[var(--surface-inverse)]" src={videoUrl} controls preload="metadata" playsInline aria-label={`Preview ${selected.fileName}`} /> : <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)]"><Film className="size-8 text-[var(--fg-subtle)]" /></div>}
      </CardContent>
    </Card>
  )
}

export function PublisherPanel({ campaigns, guides }: { campaigns: CampaignSummary[]; guides: PlatformGuide[] }) {
  const queryClient = useQueryClient()
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [outputRelativePath, setOutputRelativePath] = useState("")
  const [title, setTitle] = useState<string | null>(null)
  const [caption, setCaption] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState<PublishPrivacy>("private")
  const [shareToFeed, setShareToFeed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishingPlatform[]>([])
  const idempotencyKeys = useRef(new Map<PublishingPlatform, string>())
  const clips = useQuery({ queryKey: ["campaign", campaignId, "outputs"], queryFn: () => api.renderedClips(campaignId), enabled: Boolean(campaignId), retry: 1 })
  const accountKits = useQuery({ queryKey: ["publishing", "account-kits", campaignId], queryFn: () => api.accountKits(campaignId), enabled: Boolean(campaignId), retry: 1 })
  const connections = useQuery({ queryKey: ["publishing", "connections"], queryFn: api.publishingConnections, retry: 1 })
  const jobs = useQuery({ queryKey: ["publishing", "jobs", campaignId], queryFn: () => api.publishingJobs({ campaignId }), enabled: Boolean(campaignId), retry: 1, refetchInterval: (query) => (query.state.data?.some((job) => activeStatuses.has(job.status)) ? 2_000 : 15_000) })
  const selectedClip = clips.data?.find((clip) => clip.relativePath === outputRelativePath)
  // YouTube can have several pages: this campaign uploads to its own, so that is the one to show.
  const youtubePage = useYouTubeSchedule({ campaignId }).data?.pageId
  const connectionByPlatform = useMemo(() => {
    const byPlatform = new Map<PublishingPlatform, PublishingConnectionStatus>()
    for (const connection of connections.data ?? []) {
      if (connection.platform === "YouTubeShorts" && connection.id && connection.id !== youtubePage) continue
      if (!byPlatform.has(connection.platform)) byPlatform.set(connection.platform, connection)
    }
    return byPlatform
  }, [connections.data, youtubePage])
  const invalidateConfirmation = () => { setConfirmed(false); idempotencyKeys.current.clear() }
  const enabledDefaults = (accountKits.data ?? []).filter((kit) => kit.publishDefaults.enabled)
  const defaultTitle = enabledDefaults[0]?.publishDefaults.title || campaigns.find((campaign) => campaign.id === campaignId)?.name || ""
  const defaultCaption = [...new Set(enabledDefaults.map((kit) => kit.publishDefaults.caption.trim()).filter(Boolean))].join("\n")
  const effectiveTitle = title ?? defaultTitle
  const effectiveCaption = caption ?? defaultCaption
  const publish = useMutation({
    mutationFn: async (platforms: PublishingPlatform[]) => {
      const settled = await Promise.all(platforms.map(async (platform) => {
        try {
          let key = idempotencyKeys.current.get(platform)
          if (!key) { key = crypto.randomUUID(); idempotencyKeys.current.set(platform, key) }
          const job = await api.createPublishingJob(campaignId, { platform, outputRelativePath, title: effectiveTitle.trim(), caption: effectiveCaption.trim(), privacy: platform === "InstagramReels" ? "public" : privacy, shareToFeed: platform === "InstagramReels" ? shareToFeed : undefined, confirmed: true, idempotencyKey: key })
          idempotencyKeys.current.delete(platform)
          return { platform, job }
        } catch (error) { return { platform, error } }
      }))
      const created = settled.flatMap((result) => "job" in result ? [result] : [])
      const failed = settled.flatMap((result) => "error" in result ? [result] : [])
      if (!created.length && failed.length) throw failed[0].error
      return { created, failed }
    },
    onSuccess: ({ created, failed }) => {
      if (created.length) toast.success(`${created.length} publishing job${created.length === 1 ? "" : "s"} created`)
      if (failed.length) toast.error(`${failed.length} platform${failed.length === 1 ? "" : "s"} could not be queued. Retry uses the same duplicate-safe key.`)
      setConfirmed(false)
      setSelectedPlatforms(failed.map((result) => result.platform))
      queryClient.invalidateQueries({ queryKey: ["publishing", "jobs", campaignId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const togglePlatform = (platform: PublishingPlatform, checked: boolean) => {
    if (!checked) idempotencyKeys.current.delete(platform)
    setSelectedPlatforms((current) => checked ? [...current.filter((item) => item !== platform), platform] : current.filter((item) => item !== platform))
    setConfirmed(false)
  }
  const unavailable = selectedPlatforms.filter((platform) => platform !== "TikTok" && !connectionByPlatform.get(platform)?.canPublish)
  const canSubmit = Boolean(outputRelativePath && effectiveTitle.trim() && effectiveCaption.trim() && confirmed && selectedPlatforms.length && !unavailable.length)
  const destinationAccount = (platform: PublishingPlatform) => {
    if (platform !== "TikTok") return connectionByPlatform.get(platform)?.accountIdentifier || "Not identified"
    const handle = accountKits.data?.find((kit) => kit.platform === platform)?.fields.find((field) => field.key === "handle")?.value
    return handle ? `@${handle.replace(/^@/, "")}` : "Confirm in TikTok"
  }

  if (!campaigns.length) return <EmptyState title="Nothing to publish yet" description="Create a campaign, render a clip, then return here to prepare the platform uploads." icon={<Upload className="size-6" />} />
  return (
    <div className="space-y-5">
      <Alert><span className="flex gap-3"><ShieldCheckIcon /><span>You stay in control: every destination must be selected and explicitly confirmed. YouTube defaults to <strong>private</strong>; TikTok always produces a manual handoff.</span></span></Alert>
      <Card><CardContent className="p-5"><Label htmlFor="publishing-campaign">Campaign</Label><Select value={campaignId} onValueChange={(value) => { setCampaignId(value); setOutputRelativePath(""); setTitle(null); setCaption(null); setPrivacy("private"); setConfirmed(false); setSelectedPlatforms([]); idempotencyKeys.current.clear() }}><SelectTrigger id="publishing-campaign" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}{campaign.brand ? ` · ${campaign.brand}` : ""}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      {clips.isError ? <ErrorState title="Couldn’t load rendered videos" message={getErrorMessage(clips.error)} onRetry={() => clips.refetch()} /> : clips.isLoading ? <Card><CardContent className="p-8 text-center text-sm text-[var(--fg-muted)]">Loading rendered videos…</CardContent></Card> : !clips.data?.length ? <EmptyState title="No rendered video yet" description="Finish and render an edit in the campaign workspace. It will appear here automatically." icon={<Film className="size-6" />} /> : <>
        <VideoPicker campaignId={campaignId} clips={clips.data} value={outputRelativePath} onChange={(value) => { setOutputRelativePath(value); setConfirmed(false); idempotencyKeys.current.clear() }} />
        <Card><CardHeader><CardTitle>2. Prepare publishing details</CardTitle><CardDescription>Campaign hashtags, mentions, disclosures, and calls to action are prefilled from the platform profiles. Review before sending.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="publish-title">Title</Label><Input id="publish-title" className="mt-1.5" value={effectiveTitle} onChange={(event) => { setTitle(event.target.value); invalidateConfirmation() }} maxLength={100} placeholder="A clear, specific title" /></div><div><Label htmlFor="publish-caption">Caption, mentions, disclosure, and hashtags</Label><Textarea id="publish-caption" className="mt-1.5 min-h-36" value={effectiveCaption} onChange={(event) => { setCaption(event.target.value); invalidateConfirmation() }} placeholder="Paste the approved campaign copy…" /></div><div className="grid gap-4 md:grid-cols-2"><div><Label>YouTube visibility</Label><Select value={privacy} onValueChange={(value) => { setPrivacy(value as PublishPrivacy); invalidateConfirmation() }}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Private (recommended)</SelectItem><SelectItem value="unlisted">Unlisted</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent></Select><p className="mt-1.5 text-xs text-[var(--fg-muted)]">YouTube starts private. Instagram publishes publicly only after a second confirmation; TikTok visibility is chosen manually.</p></div><div className="flex items-center justify-between rounded-xl border border-[var(--border-default)] p-4"><div><p className="text-sm font-semibold">Share Instagram Reel to feed</p><p className="mt-1 text-xs text-[var(--fg-muted)]">Used only when Instagram is selected.</p></div><Switch checked={shareToFeed} onCheckedChange={(checked) => { setShareToFeed(checked); invalidateConfirmation() }} /></div></div></CardContent></Card>
        <Card><CardHeader><CardTitle>3. Select destinations</CardTitle><CardDescription>Review the exact account shown on every selected card. TikTok creates a package; API destinations remain unavailable until validation succeeds.</CardDescription></CardHeader><CardContent><fieldset><legend className="sr-only">Publishing destinations</legend><div className="grid gap-3 lg:grid-cols-3">{publishingPlatforms.map((platform) => { const connection = connectionByPlatform.get(platform); const isManual = platform === "TikTok"; const ready = isManual || connection?.canPublish; const checked = selectedPlatforms.includes(platform); const kit = accountKits.data?.find((item) => item.platform === platform); const handle = kit?.fields.find((field) => field.key === "handle")?.value; const destination = isManual ? (handle ? `@${handle.replace(/^@/, "")}` : "Confirm in TikTok") : connection?.accountIdentifier; return <label key={platform} className={`flex cursor-pointer flex-col rounded-2xl border p-4 transition ${checked ? "border-brand bg-[var(--surface-accent-subtle)]" : "border-[var(--border-default)] bg-panel"} ${!ready ? "cursor-not-allowed opacity-70" : ""}`}><span className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-[var(--brand-strong)]" checked={checked} disabled={!ready} onChange={(event) => togglePlatform(platform, event.target.checked)} /><span className="font-semibold">{publishingPlatformLabels[platform]}</span><Badge className="ml-auto" variant={isManual ? "warning" : ready ? "success" : "default"}>{isManual ? "Manual" : ready ? "Ready" : "Setup needed"}</Badge></span><span className="mt-3 rounded-lg bg-[var(--surface-raised)] p-2 text-xs text-[var(--fg-body)]">Destination: <strong>{destination || "Not identified"}</strong></span><span className="mt-3 text-xs leading-relaxed text-[var(--fg-muted)]">{isManual ? "Creates a ZIP with the clip, caption, and step-by-step instructions." : connection?.capabilityMessage || "Configure this platform in Connections before uploading."}</span><span className="mt-auto pt-4 text-xs font-semibold text-[var(--fg-strong)]">{platformAction[platform]}</span></label> })}</div></fieldset></CardContent></Card>
        <Card className={confirmed ? "border-[var(--border-accent)]" : ""}><CardContent className="flex flex-col gap-4 p-6">{selectedPlatforms.length ? <div className="rounded-xl border border-[var(--border-default)] p-4"><p className="text-xs font-bold uppercase tracking-wider text-[var(--fg-muted)]">Final destinations</p><ul className="mt-2 space-y-1 text-sm">{selectedPlatforms.map((platform) => <li key={platform}><strong>{publishingPlatformLabels[platform]}:</strong> {destinationAccount(platform)}{platform === "InstagramReels" ? " · public after second confirmation" : platform === "YouTubeShorts" ? ` · ${privacy}` : " · visibility chosen in TikTok"}</li>)}</ul></div> : null}<label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand-strong)]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong className="text-sm">I reviewed the video, rights, caption, disclosure, exact accounts, and visibility.</strong><span className="mt-1 block text-xs leading-relaxed text-[var(--fg-muted)]">This confirmation is required by the local API. YouTube may upload now; Instagram still pauses before media_publish; TikTok remains manual.</span></span></label>{unavailable.length ? <Alert tone="warning">Complete connection setup for {unavailable.map((item) => publishingPlatformLabels[item]).join(", ")} before uploading.</Alert> : null}<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--fg-muted)]">{selectedClip?.fileName || "Choose a video"} · {selectedPlatforms.length} destination{selectedPlatforms.length === 1 ? "" : "s"}</p><Button variant="brand" size="lg" disabled={!canSubmit || publish.isPending} onClick={() => publish.mutate(selectedPlatforms)}><Send /> {publish.isPending ? "Creating jobs…" : selectedPlatforms.length === 1 ? platformAction[selectedPlatforms[0]] : `Send to ${selectedPlatforms.length} platforms`}</Button></div></CardContent></Card>
      </>}

      <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Publishing history</CardTitle><CardDescription>Live progress, manual handoffs, published links, and actionable errors for this campaign.</CardDescription></div><Button variant="ghost" size="icon" aria-label="Refresh publishing history" onClick={() => jobs.refetch()}><RefreshCw className={jobs.isFetching ? "animate-spin" : undefined} /></Button></CardHeader><CardContent>{jobs.isError ? <ErrorState title="Couldn’t load publishing history" message={getErrorMessage(jobs.error)} onRetry={() => jobs.refetch()} /> : jobs.isLoading ? <p className="py-8 text-center text-sm text-[var(--fg-muted)]" aria-live="polite">Loading publishing history…</p> : jobs.data?.length ? <div className="space-y-3">{jobs.data.map((job) => <JobRow key={job.id} job={job} guide={guides.find((guide) => guide.platform === job.platform)} />)}</div> : <EmptyState title="No publishing jobs" description="Choose a rendered clip, prepare the metadata, and select at least one destination." icon={<Upload className="size-6" />} />}</CardContent></Card>
    </div>
  )
}

function ShieldCheckIcon() { return <Check className="mt-0.5 size-4 shrink-0" /> }
