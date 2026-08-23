import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, FileSearch, Info, Save, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { CampaignDetail, RequirementItem, RequirementRevision } from "@/lib/types"
import { toPercent } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/page"
import { BrandingLogoCard } from "@/components/campaign/branding-logo-card"
import { BriefDocumentsCard } from "@/components/campaign/brief-documents-card"

function RequirementEditor({ campaignId, revision }: { campaignId: string; revision: RequirementRevision }) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState(revision.items ?? [])
  const isApproved = revision.status === "Approved" || Boolean(revision.approvedAt)
  const update = useMutation({
    mutationFn: () => api.updateRequirementRevision(campaignId, revision.id, { items }),
    onSuccess: () => { toast.success("Requirement corrections saved"); queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const approve = useMutation({
    mutationFn: async () => {
      if (items !== revision.items) await api.updateRequirementRevision(campaignId, revision.id, { items })
      return api.approveRequirements(campaignId, revision.id)
    },
    onSuccess: () => { toast.success("Requirements approved"); queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const updateItem = (index: number, patch: Partial<RequirementItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, origin: "UserOverride", needsReview: false } : item))
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2"><CardTitle>Structured requirements</CardTitle><Badge variant={isApproved ? "success" : "warning"}>{isApproved ? "Approved" : `Revision ${revision.version}`}</Badge></div><CardDescription>Correct uncertain values before approving this profile.</CardDescription></div>
        {!isApproved && <div className="flex gap-2"><Button variant="outline" onClick={() => update.mutate()} disabled={update.isPending}><Save /> Save corrections</Button><Button variant="brand" onClick={() => approve.mutate()} disabled={approve.isPending}><Check /> {approve.isPending ? "Approving…" : "Approve"}</Button></div>}
      </CardHeader>
      <CardContent>
        {items.length ? <div className="grid gap-4 lg:grid-cols-2">{items.map((item, index) => (
          <div key={`${item.key}-${index}`} className={`rounded-xl border p-4 ${item.needsReview ? "border-[var(--border-warning)] bg-[var(--surface-warning-subtle)]" : "border-[var(--border-default)] bg-[var(--surface-accent-subtle)]"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{item.category}</Badge>{item.origin && <span className="text-[11px] font-semibold text-[var(--fg-muted)]">{item.origin === "UserOverride" ? "Your override" : item.origin}</span>}{item.needsReview && <Badge variant="warning">Review</Badge>}<span className="ml-auto text-[11px] text-[var(--fg-muted)]">{toPercent(item.confidence)}</span></div>
            <Label htmlFor={`requirement-${index}`}>{item.label}</Label>
            <Input id={`requirement-${index}`} className="mt-1.5" value={item.value} disabled={isApproved} onChange={(event) => updateItem(index, { value: event.target.value })} />
            {item.sourceText && <blockquote className="mt-3 border-l-2 border-[var(--border-strong)] pl-3 text-xs italic leading-relaxed text-[var(--fg-muted)]">“{item.sourceText}”</blockquote>}
          </div>
        ))}</div> : <EmptyState title="No structured requirements" description="Run extraction to turn the raw campaign brief into reviewable fields." />}
      </CardContent>
    </Card>
  )
}

export function RequirementsPanel({ campaign }: { campaign: CampaignDetail }) {
  const queryClient = useQueryClient()
  const [rawInstructions, setRawInstructions] = useState(campaign.rawInstructions ?? "")
  const latestRevision = [...(campaign.requirements ?? [])].sort((a, b) => b.version - a.version)[0]
  const hasExtractableDocument = (campaign.documents ?? []).some((document) => document.includeInExtraction && document.extractionStatus === "Extracted")
  const saveRaw = useMutation({
    mutationFn: () => api.updateCampaign(campaign.id, { rawInstructions }),
    onSuccess: () => { toast.success("Original brief saved"); queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const extract = useMutation({
    mutationFn: async () => {
      if (rawInstructions !== campaign.rawInstructions) await api.updateCampaign(campaign.id, { rawInstructions })
      return api.extractRequirements(campaign.id)
    },
    onSuccess: () => { toast.success("Requirement extraction started"); queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return (
    <div className="space-y-5">
      <Alert><span className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" /><span>Extraction is advisory. Missing or uncertain values stay flagged until you review them, and no download or render should run from an unapproved revision.</span></span></Alert>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Original campaign brief</CardTitle><CardDescription>Preserved verbatim alongside every structured revision.</CardDescription></div><FileSearch className="size-5 text-brand-dark" /></CardHeader>
        <CardContent>
          <Textarea className="min-h-64 font-mono text-xs" value={rawInstructions} onChange={(event) => setRawInstructions(event.target.value)} placeholder="Paste the full Whop campaign instructions here…" />
          <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => saveRaw.mutate()} disabled={saveRaw.isPending}><Save /> Save brief</Button><Button variant="brand" onClick={() => extract.mutate()} disabled={extract.isPending || (rawInstructions.trim().length < 10 && !hasExtractableDocument)}><Sparkles /> {extract.isPending ? "Extracting…" : latestRevision ? "Create new extraction" : "Extract requirements"}</Button></div>
        </CardContent>
      </Card>
      <BriefDocumentsCard campaignId={campaign.id} documents={campaign.documents ?? []} />
      <BrandingLogoCard campaignId={campaign.id} branding={campaign.branding} />
      {latestRevision ? <RequirementEditor key={latestRevision.id} campaignId={campaign.id} revision={latestRevision} /> : <EmptyState title="Ready to extract" description="The extractor reads the pasted brief plus any attached PDF or Word file, then identifies platforms, durations, captions, account rules, branding, rewards, and prohibited content." icon={<Sparkles className="size-6" />} action={<Button variant="brand" onClick={() => extract.mutate()} disabled={extract.isPending}><Sparkles /> Extract now</Button>} />}
    </div>
  )
}
