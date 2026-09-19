import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, CheckCircle2, Clipboard, Download, FileCheck2, FolderArchive, Info, TriangleAlert, XCircle } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { CampaignDetail } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RenderedClipsCard } from "@/components/campaign/rendered-clips-card"
import { EmptyState } from "@/components/page"
import { JobStatusBadge } from "@/components/status-badge"

function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const area = document.createElement("textarea")
  area.value = value
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  document.execCommand("copy")
  area.remove()
  return Promise.resolve()
}

export function ReviewPanel({ campaign }: { campaign: CampaignDetail }) {
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({ tone: false, rights: false, copy: false })
  const [exportResult, setExportResult] = useState<{ folderRelativePath: string; summaryRelativePath: string } | null>(null)
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs(), refetchInterval: 3_000, retry: false })
  const campaignJobs = (jobs.data ?? []).filter((job) => job.campaignId === campaign.id)
  const renderJobs = campaignJobs.filter((job) => job.type === "Render")
  const latestRender = renderJobs[0]
  const latestValidation = campaignJobs.find((job) => job.type === "Validate")
  const enabledProfiles = useMemo(() => campaign.platformProfiles?.filter((profile) => profile.enabled) ?? [], [campaign.platformProfiles])
  const publishingText = useMemo(() => enabledProfiles.map((profile) => [profile.platform.replace(/([a-z])([A-Z])/g, "$1 $2"), profile.captionTemplate, [...profile.mentions, ...profile.hashtags].join(" "), profile.disclosure, profile.cta].filter(Boolean).join("\n")).join("\n\n---\n\n"), [enabledProfiles])
  const approvedRequirements = campaign.requirements?.some((revision) => revision.status === "Approved" || revision.approvedAt)
  let validationChecks: Array<{ name: string; status: string; detail?: string }> = []
  try { validationChecks = latestValidation?.resultJson ? (JSON.parse(latestValidation.resultJson) as { checks?: Array<{ name: string; status: string; detail?: string }> }).checks ?? [] : [] } catch { validationChecks = [] }
  const validationPassed = latestValidation?.status === "Completed" && !validationChecks.some((check) => check.status === "Failed")
  const hardChecks = [
    { label: "Approved campaign requirements", passed: approvedRequirements, detail: approvedRequirements ? "An approved revision is locked for this workspace." : "Approve a requirement revision before export." },
    { label: "At least one platform profile enabled", passed: enabledProfiles.length > 0, detail: `${enabledProfiles.length} output profile${enabledProfiles.length === 1 ? "" : "s"} enabled.` },
    { label: "Source stored locally", passed: campaign.sources?.some((source) => source.status === "Downloaded" || source.localPath), detail: "The export records the exact source asset used." },
    { label: "Render completed", passed: latestRender?.status === "Completed", detail: latestRender ? `Latest render is ${latestRender.status.toLowerCase()}.` : "No render job has been created yet." },
    { label: "Technical validation passed", passed: validationPassed, detail: latestValidation ? `Validation job is ${latestValidation.status.toLowerCase()}.` : "Run FFprobe validation after the render completes." },
  ]
  const ready = hardChecks.every((check) => check.passed) && Object.values(manualChecks).every(Boolean)
  const exportCampaign = useMutation({ mutationFn: () => api.exportCampaign(campaign.id), onSuccess: (result) => { setExportResult(result); toast.success("Publishing package exported") }, onError: (error) => toast.error(getErrorMessage(error)) })
  const validate = useMutation({ mutationFn: () => api.validateRender(latestRender!.id), onSuccess: () => { toast.success("Technical validation queued"); jobs.refetch() }, onError: (error) => toast.error(getErrorMessage(error)) })
  return (
    <div className="space-y-5">
      <RenderedClipsCard campaignId={campaign.id} defaultVoice={campaign.editStyle?.voiceVolume ?? 1} defaultMusic={campaign.editStyle?.musicVolume ?? 0.2} />

      <Alert><span className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" /><span>Whop Clipper prepares a package for your review. Publishing is automatic only for explicitly connected, eligible platforms; TikTok and Whop campaign submission remain manual.</span></span></Alert>
      {!latestRender ? <EmptyState title="No render to review" description="Approve an edit plan and queue a render. Completed output will appear here with technical validation." icon={<FileCheck2 className="size-6" />} /> : (
        <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Latest render</CardTitle><CardDescription>{latestRender.message || latestRender.outputPath || "FFmpeg output job"}</CardDescription></div><div className="flex items-center gap-2"><JobStatusBadge status={latestRender.status} />{latestRender.status === "Completed" && <Button size="sm" variant="outline" onClick={() => validate.mutate()} disabled={validate.isPending || latestValidation?.status === "Running" || latestValidation?.status === "Queued"}><FileCheck2 /> {validate.isPending ? "Queuing…" : latestValidation ? "Validate again" : "Run validation"}</Button>}</div></CardHeader><CardContent>{latestRender.errorSummary && <Alert tone="error">{latestRender.errorSummary}</Alert>}<div className="mt-2 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-[11px] font-semibold text-[var(--fg-muted)]">Job</p><p className="mt-1 truncate font-mono text-xs">{latestRender.id}</p></div><div className="rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-[11px] font-semibold text-[var(--fg-muted)]">Progress</p><p className="mt-1 text-sm font-semibold">{Math.round(latestRender.progress)}%</p></div><div className="rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-[11px] font-semibold text-[var(--fg-muted)]">Output</p><p className="mt-1 truncate text-xs" title={latestRender.outputPath || undefined}>{latestRender.outputPath || "Pending"}</p></div></div>{latestValidation && <div className="mt-4 rounded-xl border border-[var(--border-default)] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">FFprobe validation</p><JobStatusBadge status={latestValidation.status} /></div>{validationChecks.length ? <div className="space-y-2">{validationChecks.map((check) => <div key={check.name} className="flex items-start gap-2 text-xs"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${check.status === "Passed" ? "bg-brand-dark" : check.status === "Failed" ? "bg-[var(--danger-solid)]" : "bg-[var(--warning-solid)]"}`} /><span><strong>{check.name}:</strong> {check.detail || check.status}</span></div>)}</div> : <p className="text-xs text-[var(--fg-muted)]">Validation output will appear when the job completes.</p>}</div>}</CardContent></Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Compliance checklist</CardTitle><CardDescription>Technical facts are automatic; subjective decisions stay with you.</CardDescription></CardHeader><CardContent className="space-y-3">{hardChecks.map((check) => <div key={check.label} className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] p-4"><span className={`mt-0.5 rounded-full p-1 ${check.passed ? "bg-[var(--surface-accent)] text-[var(--brand-text)]" : "bg-[var(--surface-danger-subtle)] text-[var(--danger-text)]"}`}>{check.passed ? <Check className="size-3.5" /> : <XCircle className="size-3.5" />}</span><div><p className="text-sm font-semibold">{check.label}</p><p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{check.detail}</p></div></div>)}<div className="pt-2"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--fg-muted)]">Manual review</p>{[
          ["tone", "Content, context, and tone match the campaign"], ["rights", "Source, music, and SFX usage rights are confirmed"], ["copy", "Caption, mentions, disclosure, and CTA are correct"],
        ].map(([id, label]) => <label key={id} className="mb-2 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-default)] p-4 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand-strong)]" checked={manualChecks[id] ?? false} onChange={(event) => setManualChecks((checks) => ({ ...checks, [id]: event.target.checked }))} /><span>{label}</span></label>)}</div></CardContent></Card>

        <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Publishing copy</CardTitle><CardDescription>Separated by enabled platform.</CardDescription></div><Button size="sm" variant="outline" onClick={() => copyText(publishingText).then(() => toast.success("Publishing copy copied"))} disabled={!publishingText}><Clipboard /> Copy</Button></CardHeader><CardContent>{publishingText ? <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 font-sans text-xs leading-relaxed text-[var(--fg-strong)]">{publishingText}</pre> : <p className="py-8 text-center text-sm text-[var(--fg-muted)]">No enabled platform profiles.</p>}</CardContent></Card>
      </div>

      <Card className={ready ? "border-brand/50 bg-[var(--surface-accent-subtle)]" : ""}><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center"><span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${ready ? "bg-[var(--surface-accent)] text-[var(--brand-text)]" : "bg-[var(--surface-warning)] text-[var(--warning-text)]"}`}>{ready ? <CheckCircle2 className="size-6" /> : <TriangleAlert className="size-6" />}</span><div className="flex-1"><h3 className="font-semibold">{ready ? "Ready to export" : "Review is not complete"}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--fg-body)]">{ready ? "Create the final local folder with video, subtitles, publishing copy, metadata, AI summary, and attribution notes." : "Resolve hard failures and acknowledge every manual review item before exporting."}</p></div><Button variant="brand" disabled={!ready || exportCampaign.isPending} onClick={() => exportCampaign.mutate()}><FolderArchive /> {exportCampaign.isPending ? "Exporting…" : "Export package"}</Button></CardContent></Card>
      {exportResult && <Alert tone="success"><div className="flex gap-3"><Download className="mt-0.5 size-4 shrink-0" /><div><strong>Export complete.</strong><p className="mt-1 font-mono text-xs">{exportResult.folderRelativePath}</p><p className="mt-1 text-xs">Summary: {exportResult.summaryRelativePath}</p></div></div></Alert>}
    </div>
  )
}
