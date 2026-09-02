import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Bot, BrainCircuit, Check, ChevronRight, Clock3, Columns2, Info, Play, Shield, Sparkles, Trophy } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { AiMode, CampaignDetail, HighlightCandidate, Platform } from "@/lib/types"
import { usePagination } from "@/lib/pagination"
import { formatDuration } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, Pagination } from "@/components/page"

const CANDIDATES_PER_PAGE = 10

const modes: Array<{ id: AiMode; label: string; description: string; icon: typeof Bot }> = [
  { id: "Auto", label: "Auto", description: "Choose the best available provider", icon: Sparkles },
  { id: "Claude", label: "Claude", description: "Run Claude CLI only", icon: BrainCircuit },
  { id: "Codex", label: "Codex", description: "Run Codex CLI only", icon: Bot },
  { id: "Compare", label: "Compare", description: "Run both and compare results", icon: Columns2 },
]

function Score({ label, value }: { label: string; value?: number }) {
  const normalized = value == null ? 0 : value <= 1 ? value * 100 : value
  return <div><div className="mb-1.5 flex justify-between text-[11px]"><span className="text-[var(--fg-muted)]">{label}</span><span className="font-semibold text-[var(--fg-strong)]">{Math.round(normalized)}</span></div><Progress className="h-1.5" value={normalized} /></div>
}

function CandidateCard({ candidate, selected, onSelect }: { candidate: HighlightCandidate; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`w-full rounded-2xl border p-5 text-left transition ${selected ? "border-brand-dark bg-[var(--surface-accent-subtle)] shadow-[0_0_0_2px_rgb(54_216_153/0.15)]" : "border-[var(--border-default)] bg-panel hover:border-[var(--border-strong)]"}`}>
      <div className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${candidate.rank === 1 ? "bg-[var(--surface-warning)] text-[var(--warning-text)]" : "bg-[var(--surface-subtle)] text-[var(--fg-body)]"}`}>{candidate.rank === 1 ? <Trophy className="size-4" /> : candidate.rank}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{candidate.title}</h3><Badge variant={candidate.provider === "Claude" ? "default" : "secondary"}>{candidate.provider}</Badge></div><div className="mt-1 flex items-center gap-3 text-xs text-[var(--fg-muted)]"><span className="flex items-center gap-1"><Clock3 className="size-3" /> {formatDuration(candidate.startSeconds)}–{formatDuration(candidate.endSeconds)}</span><span>{formatDuration(candidate.endSeconds - candidate.startSeconds)} clip</span></div></div>{selected && <span className="rounded-full bg-brand p-1 text-[var(--on-brand)]"><Check className="size-3.5" /></span>}</div>
      <div className="mt-4 rounded-xl bg-[var(--surface-subtle)] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Opening hook</p><p className="mt-1 text-sm font-medium leading-relaxed text-[var(--fg-strong)]">“{candidate.hook}”</p></div>
      <p className="mt-4 text-xs leading-relaxed text-[var(--fg-body)]">{candidate.rationale}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Score label="Campaign fit" value={candidate.campaignFit} /><Score label="Retention" value={candidate.retentionPotential} /><Score label="Confidence" value={candidate.confidence} /></div>
      {candidate.uncertainties?.length ? <p className="mt-3 text-[11px] text-[var(--warning-text)]">Needs review: {candidate.uncertainties.join("; ")}</p> : null}
    </button>
  )
}

export function AiAnalysisPanel({ campaign, selectedCandidateId, onSelectCandidate, onContinue }: { campaign: CampaignDetail; selectedCandidateId?: string; onSelectCandidate: (candidate: HighlightCandidate) => void; onContinue: () => void }) {
  const downloadedSources = (campaign.sources ?? []).filter((source) => source.status === "Downloaded" || source.localPath)
  const enabledProfiles = (campaign.platformProfiles ?? []).filter((profile) => profile.enabled)
  const [sourceId, setSourceId] = useState(downloadedSources[0]?.id ?? "")
  const [platform, setPlatform] = useState<Platform | "">(enabledProfiles[0]?.platform ?? "")
  const [mode, setMode] = useState<AiMode>(campaign.selectedAiMode ?? "Compare")
  const [transcript, setTranscript] = useState("")
  const analysisStorageKey = `whopclipper.analysis.${campaign.id}`
  const [analysisId, setAnalysisId] = useState(() => campaign.latestAnalysis?.id ?? (typeof window === "undefined" ? "" : window.localStorage.getItem(analysisStorageKey) ?? ""))
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: api.aiProviders, retry: false })
  const analysis = useQuery({ queryKey: ["analysis", analysisId], queryFn: () => api.analysis(analysisId), enabled: Boolean(analysisId), initialData: campaign.latestAnalysis?.id === analysisId ? campaign.latestAnalysis : undefined, refetchInterval: (query) => ["Queued", "Running"].includes(query.state.data?.status ?? "") ? 2_000 : false })
  const selectedSource = downloadedSources.find((source) => source.id === sourceId)
  const hasTranscript = Boolean(transcript.trim() || selectedSource?.subtitleRelativePath)
  const start = useMutation({ mutationFn: () => { if (!platform) throw new Error("Enable and select a platform profile before running analysis."); return api.startAnalysis(campaign.id, sourceId, mode, platform, transcript) }, onSuccess: (result) => { setAnalysisId(result.id); window.localStorage.setItem(analysisStorageKey, result.id); window.localStorage.setItem(`whopclipper.analysis-platform.${result.id}`, result.platform ?? platform); toast.success(`${mode} analysis queued for ${platform.replace(/([a-z])([A-Z])/g, "$1 $2")}`) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const select = useMutation({ mutationFn: (candidate: HighlightCandidate) => api.selectHighlight(analysisId, candidate.id).then(() => candidate), onSuccess: onSelectCandidate, onError: (error) => toast.error(getErrorMessage(error)) })
  const contextItems = ["Original campaign instructions as untrusted data", "Selected platform and target duration", "Source title and duration metadata", transcript.trim() ? "The transcript or SRT pasted below" : selectedSource?.subtitleRelativePath ? "The downloaded subtitle file attached to this source" : "No transcript is available yet"]
  const result = analysis.data
  const paged = usePagination(result?.candidates ?? [], CANDIDATES_PER_PAGE, result?.id ?? "")
  const storedPlatform = analysisId && typeof window !== "undefined" ? window.localStorage.getItem(`whopclipper.analysis-platform.${analysisId}`) : null
  const analysisPlatform = enabledProfiles.find((profile) => profile.platform === storedPlatform)?.platform ?? result?.platform ?? platform
  return (
    <div className="space-y-5">
      <Alert tone="warning"><span className="flex gap-2"><Shield className="mt-0.5 size-4 shrink-0" /><span>Claude and Codex are cloud-connected CLIs. Starting analysis sends the bounded context shown below to the selected provider; source files and unrelated folders are not exposed.</span></span></Alert>
      <Card>
        <CardHeader><CardTitle>Analyze source</CardTitle><CardDescription>Select a downloaded source and how the AI providers should run.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div><label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]">Source media</label><Select value={sourceId} onValueChange={setSourceId}><SelectTrigger><SelectValue placeholder="Choose a downloaded source" /></SelectTrigger><SelectContent>{downloadedSources.map((source) => <SelectItem key={source.id} value={source.id}>{source.title}</SelectItem>)}</SelectContent></Select>{!downloadedSources.length && <p className="mt-2 text-xs text-[var(--warning-text)]">Download at least one source before running analysis.</p>}</div>
          <div><label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]">Target platform</label><Select value={platform} onValueChange={(value) => setPlatform(value as Platform)} disabled={!enabledProfiles.length}><SelectTrigger><SelectValue placeholder="Choose an enabled platform" /></SelectTrigger><SelectContent>{enabledProfiles.map((profile) => <SelectItem key={profile.platform} value={profile.platform}>{profile.platform.replace(/([a-z])([A-Z])/g, "$1 $2")} · {profile.width} × {profile.height} · {profile.preferredDurationSeconds}s target</SelectItem>)}</SelectContent></Select>{!enabledProfiles.length && <p className="mt-2 text-xs text-[var(--warning-text)]">Enable at least one platform profile before running analysis.</p>}</div>
          <div><label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]">Transcript or SRT <span className="font-normal text-[var(--fg-muted)]">optional when downloaded captions are available</span></label><Textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} className="min-h-32 font-mono text-xs" placeholder="Paste transcript text or SRT captions for sources without downloaded subtitles…" />{selectedSource?.subtitleRelativePath ? <p className="mt-2 text-xs text-[var(--fg-body)]">A downloaded subtitle file is available. Leave this empty to use it automatically, or paste text to override it.</p> : sourceId ? <p className="mt-2 text-xs text-[var(--warning-text)]">This source has no downloaded subtitle path. Paste a transcript or SRT before starting analysis.</p> : null}</div>
          <div><label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]">Provider mode</label><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{modes.map((item) => { const unavailable = (item.id === "Claude" || item.id === "Codex") && providers.data?.some((provider) => provider.provider === item.id && !provider.available); return <button key={item.id} type="button" disabled={unavailable} onClick={() => setMode(item.id)} className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${mode === item.id ? "border-brand-dark bg-[var(--surface-accent-subtle)]" : "border-[var(--border-default)] hover:border-[var(--border-strong)]"}`}><div className="flex items-center justify-between"><item.icon className={`size-5 ${mode === item.id ? "text-brand-dark" : "text-[var(--fg-muted)]"}`} />{mode === item.id && <Check className="size-4 text-brand-dark" />}</div><p className="mt-3 text-sm font-semibold">{item.label}</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--fg-muted)]">{item.description}</p></button> })}</div></div>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg-body)]"><Info className="size-3.5" /> Context to be shared</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{contextItems.map((item) => <li key={item} className="flex gap-2 text-xs text-[var(--fg-muted)]"><Check className="mt-0.5 size-3.5 shrink-0 text-brand-dark" />{item}</li>)}</ul></div>
          <div className="flex justify-end"><Button variant="brand" disabled={!sourceId || !platform || !hasTranscript || start.isPending} onClick={() => start.mutate()}><Play /> {start.isPending ? "Starting…" : `Run ${mode} analysis`}</Button></div>
        </CardContent>
      </Card>

      {result && <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Provider runs</CardTitle><CardDescription>Same schema and bounded analysis package for comparable results.</CardDescription></div><Badge variant={result.status === "Completed" ? "success" : result.status === "Failed" ? "destructive" : "default"}>{result.status}</Badge></CardHeader><CardContent>{result.providerRuns?.length ? <div className="grid gap-3 sm:grid-cols-2">{result.providerRuns.map((run) => <div key={run.provider} className="rounded-xl border border-[var(--border-default)] p-4"><div className="flex items-center justify-between"><p className="font-semibold">{run.provider}</p><Badge variant={run.status === "Completed" ? "success" : run.status === "Failed" ? "destructive" : "default"}>{run.status}</Badge></div><p className="mt-2 text-xs text-[var(--fg-muted)]">{run.model || "Default model"} · {run.candidateCount ?? 0} candidates {run.durationMs ? `· ${(run.durationMs / 1000).toFixed(1)}s` : ""}</p>{run.error && <p className="mt-2 text-xs text-[var(--danger-text)]">{run.error}</p>}</div>)}</div> : <div className="flex items-center gap-3 text-sm text-[var(--fg-body)]"><Sparkles className="size-4 animate-pulse text-brand-dark" />Waiting for provider details…</div>}</CardContent></Card>}

      {result?.candidates?.length ? <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-semibold">Ranked highlights</h2><p className="mt-1 text-xs text-[var(--fg-muted)]">Select one to prefill the {analysisPlatform?.replace(/([a-z])([A-Z])/g, "$1 $2")} edit plan.</p></div><span className="text-xs text-[var(--fg-muted)]">{result.candidates.length} candidates</span></div><div className="grid gap-4 xl:grid-cols-2">{paged.items.map((candidate) => { const platformCandidate = { ...candidate, platform: analysisPlatform || undefined }; return <CandidateCard key={candidate.id} candidate={platformCandidate} selected={selectedCandidateId === candidate.id} onSelect={() => select.mutate(platformCandidate)} /> })}</div><Pagination className="px-0" page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPageChange={paged.setPage} noun="highlights" /></section> : !analysisId ? <EmptyState title="No analysis yet" description="Once a source is downloaded, run Claude, Codex, Auto, or Compare to rank high-potential moments." icon={<BrainCircuit className="size-6" />} /> : analysis.isError ? <EmptyState title="Saved analysis is unavailable" description={`${getErrorMessage(analysis.error)} Run a new analysis to replace it.`} /> : result?.status === "Failed" ? <EmptyState title="Analysis failed" description={result.sharedContextSummary || "Review the provider setup and job error, then try again."} /> : result?.status === "Completed" ? <EmptyState title="No valid highlights returned" description="Review provider output or try another source and mode." /> : <div className="rounded-2xl border border-[var(--border-default)] bg-panel p-8 text-center"><Sparkles className="mx-auto size-6 animate-pulse text-brand-dark" /><p className="mt-3 text-sm font-semibold">Analysis in progress</p><p className="mt-1 text-xs text-[var(--fg-muted)]">The job can continue while you visit another screen.</p></div>}
      {selectedCandidateId && <div className="flex justify-end"><Button variant="brand" onClick={onContinue}><span>Continue to edit plan</span><ChevronRight /></Button></div>}
    </div>
  )
}
