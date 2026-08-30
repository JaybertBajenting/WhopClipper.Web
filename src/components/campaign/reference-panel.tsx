import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Clapperboard, Gauge, Link2, LoaderCircle, RefreshCw, ShieldCheck, Star, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { ACCEPTED_REFERENCE_TYPES, api, getErrorMessage, MAX_REFERENCE_BYTES } from "@/lib/api"
import type { CampaignDetail, ReferenceVideo } from "@/lib/types"
import { formatDate, formatDuration } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { DetectedLinksCard } from "@/components/campaign/detected-links-card"
import { LocalSourcesCard } from "@/components/campaign/local-sources-card"
import { EmptyState } from "@/components/page"

const statusTone: Record<ReferenceVideo["status"], "default" | "secondary" | "success" | "warning" | "destructive"> = {
  Pending: "secondary", Analyzing: "warning", Analyzed: "success", Failed: "destructive",
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-panel p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}

function StyleProfile({ reference }: { reference: ReferenceVideo }) {
  const profile = reference.styleProfile
  if (!profile) return null
  const { shots, loudness } = profile
  return (
    <div className="mt-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Pacing" value={`${profile.pacing} · ${shots.cutsPerMinute.toFixed(1)}/min`} />
        <Metric label="Average shot" value={`${shots.averageShotSeconds.toFixed(2)}s`} />
        <Metric label="Opening shot" value={`${shots.openingShotSeconds.toFixed(2)}s`} />
        <Metric label="Cuts" value={`${shots.cutCount}`} />
        <Metric label="Frame" value={`${profile.orientation} ${profile.aspectRatio} · ${profile.frameRate.toFixed(0)} fps`} />
        <Metric label="Shot range" value={`${shots.shortestShotSeconds.toFixed(2)}–${shots.longestShotSeconds.toFixed(2)}s`} />
        <Metric label="Loudness" value={loudness.integratedLufs == null ? "—" : `${loudness.integratedLufs.toFixed(1)} LUFS`} />
        <Metric label="Narration" value={profile.spokenWordsPerMinute == null ? "—" : `${Math.round(profile.spokenWordsPerMinute)} wpm`} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {profile.summary.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-[var(--fg-body)]"><Gauge className="mt-0.5 size-3.5 shrink-0 text-brand-dark" />{line}</li>
        ))}
      </ul>
    </div>
  )
}

function ReferenceCard({ campaignId, reference }: { campaignId: string; reference: ReferenceVideo }) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState(reference.notes ?? "")
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }); queryClient.invalidateQueries({ queryKey: ["jobs"] }) }
  const save = useMutation({
    mutationFn: (patch: { notes?: string; isPrimary?: boolean }) => api.updateReferenceVideo(campaignId, reference.id, {
      label: reference.label, notes: patch.notes ?? notes, isPrimary: patch.isPrimary ?? reference.isPrimary,
    }),
    onSuccess: () => { toast.success("Reference updated"); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const analyze = useMutation({
    mutationFn: (refresh: boolean) => api.analyzeReferenceVideo(campaignId, reference.id, refresh),
    onSuccess: () => { toast.success("Style analysis queued"); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteReferenceVideo(campaignId, reference.id),
    onSuccess: () => { toast.success("Reference removed"); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const busy = reference.status === "Analyzing" || reference.status === "Pending"
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{reference.label}</h3>
            <Badge variant={statusTone[reference.status]}>{busy && <LoaderCircle className="animate-spin" />}{reference.status}</Badge>
            {reference.isPrimary && <Badge><Star /> Primary</Badge>}
          </div>
          <p className="text-xs text-[var(--fg-muted)]">
            {reference.url ? "Downloaded from URL" : "Uploaded file"} · {formatDuration(reference.durationSeconds)}
            {reference.analyzedAt ? ` · Measured ${formatDate(reference.analyzedAt, true)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!reference.isPrimary && <Button variant="outline" size="sm" onClick={() => save.mutate({ isPrimary: true })} disabled={save.isPending}><Star /> Make primary</Button>}
          <Button variant="outline" size="sm" onClick={() => analyze.mutate(false)} disabled={analyze.isPending || busy}><RefreshCw /> {reference.status === "Analyzed" ? "Re-measure" : "Measure style"}</Button>
          <Button variant="ghost" size="icon" aria-label={`Remove ${reference.label}`} onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 /></Button>
        </div>
      </div>

      {reference.status === "Failed" && reference.error && <Alert tone="error" className="mt-3">{reference.error}</Alert>}
      <StyleProfile reference={reference} />

      <div className="mt-4">
        <Label htmlFor={`reference-notes-${reference.id}`}>Style notes for the editor</Label>
        <Textarea id={`reference-notes-${reference.id}`} className="mt-1.5 min-h-20 text-xs" value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Hard cuts on the beat, big centred captions, no music under the hook…" />
        <div className="mt-2 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => save.mutate({ notes })} disabled={save.isPending || notes === (reference.notes ?? "")}>Save notes</Button>
        </div>
      </div>
    </div>
  )
}

export function ReferencePanel({ campaign }: { campaign: CampaignDetail }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState("")
  const [label, setLabel] = useState("")
  const [progress, setProgress] = useState<{ fileName: string; percent: number } | null>(null)
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] }); queryClient.invalidateQueries({ queryKey: ["jobs"] }) }
  const addUrl = useMutation({
    mutationFn: () => api.addReferenceVideo(campaign.id, { url: url.trim(), label: label.trim() || undefined }),
    onSuccess: () => { toast.success("Reference added; style analysis queued"); setUrl(""); setLabel(""); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const uploadFile = useMutation({
    mutationFn: (file: File) => {
      setProgress({ fileName: file.name, percent: 0 })
      return api.uploadReferenceVideo(campaign.id, file, { label: label.trim() || undefined }, (percent) => setProgress({ fileName: file.name, percent }))
    },
    onSuccess: () => { toast.success("Reference uploaded; style analysis queued"); setLabel(""); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { setProgress(null); if (inputRef.current) inputRef.current.value = "" },
  })
  const references = campaign.referenceVideos ?? []
  return (
    <div className="space-y-5">
      <Alert>
        <span className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>Whop Clipper measures a reference locally with FFmpeg — cut rhythm, shot lengths, orientation, and loudness — and sends only those numbers to Claude or Codex. The video file itself never leaves this machine.</span>
        </span>
      </Alert>

      <DetectedLinksCard campaignId={campaign.id} target="reference" />

      <LocalSourcesCard campaignId={campaign.id} target="reference" />

      <Card>
        <CardHeader>
          <CardTitle>Add a reference video</CardTitle>
          <CardDescription>Point at a clip that already edits the way you want this campaign to look, or upload one from disk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="reference-label">Label (optional)</Label>
            <Input id="reference-label" className="mt-1.5" placeholder="Fast-cut podcast style" value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (url.trim()) addUrl.mutate() }}>
            <Label htmlFor="reference-url">Reference URL</Label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" />
                <Input id="reference-url" className="pl-9" placeholder="https://tiktok.com/@creator/video/…" value={url} onChange={(event) => setUrl(event.target.value)} />
              </div>
              <Button type="submit" variant="brand" disabled={addUrl.isPending || url.trim().length < 8}>
                {addUrl.isPending ? <LoaderCircle className="animate-spin" /> : <Link2 />} Add & measure
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-default)] pt-4">
            <input ref={inputRef} type="file" className="hidden" accept={ACCEPTED_REFERENCE_TYPES}
              onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadFile.mutate(file) }} />
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploadFile.isPending}>
              <Upload /> {uploadFile.isPending ? "Uploading…" : "Upload a reference file"}
            </Button>
            <span className="text-xs text-[var(--fg-muted)]">MP4, MOV, M4V, WebM, or MKV up to {MAX_REFERENCE_BYTES / 1024 ** 3} GB.</span>
          </div>
          {progress && (
            <div>
              <p className="mb-1.5 truncate text-xs text-[var(--fg-body)]">{progress.fileName} — {progress.percent}%</p>
              <Progress value={progress.percent} />
            </div>
          )}
          <p className="text-xs leading-relaxed text-[var(--fg-muted)]">Only use references you are allowed to download. URL references are fetched at 720p, which is plenty for measuring pacing and loudness.</p>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Campaign references</h2>
          <span className="text-xs text-[var(--fg-muted)]">{references.length} total</span>
        </div>
        {references.length ? (
          <div className="space-y-3">{references.map((reference) => <ReferenceCard key={reference.id} campaignId={campaign.id} reference={reference} />)}</div>
        ) : (
          <EmptyState title="No reference video" description="Add one clip that edits the way this campaign should look. Its measured pacing, framing, and loudness then steer every AI edit plan." icon={<Clapperboard className="size-6" />} />
        )}
      </div>
    </div>
  )
}
