import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Archive, ArrowLeft, BrainCircuit, Clapperboard, ExternalLink, FileCheck2, FileText, Film, MonitorSmartphone, Pencil, RotateCcw, Scissors, Send, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { HighlightCandidate } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { AiAnalysisPanel } from "@/components/campaign/ai-analysis-panel"
import { CampaignFormDialog } from "@/components/campaign/campaign-form-dialog"
import { DeleteCampaignDialog } from "@/components/campaign/delete-campaign-dialog"
import { EditPlanPanel } from "@/components/campaign/edit-plan-panel"
import { PlatformProfilesPanel } from "@/components/campaign/platform-profiles-panel"
import { ReferencePanel } from "@/components/campaign/reference-panel"
import { RequirementsPanel } from "@/components/campaign/requirements-panel"
import { ReviewPanel } from "@/components/campaign/review-panel"
import { SourcesPanel } from "@/components/campaign/sources-panel"
import { CampaignPublishingPanel } from "@/components/campaign/campaign-publishing-panel"
import { CampaignStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState, LoadingPage } from "@/components/page"

const stages = [
  { id: "requirements", label: "Requirements", icon: FileText },
  { id: "profiles", label: "Profiles", icon: MonitorSmartphone },
  { id: "sources", label: "Sources", icon: Film },
  { id: "reference", label: "Reference style", icon: Clapperboard },
  { id: "analysis", label: "AI highlights", icon: BrainCircuit },
  { id: "edit", label: "Edit plan", icon: Scissors },
  { id: "review", label: "Review & export", icon: FileCheck2 },
  { id: "publish", label: "Publish", icon: Send },
] as const

export function CampaignWorkspacePage({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient()
  const campaign = useQuery({ queryKey: ["campaign", campaignId], queryFn: () => api.campaign(campaignId), retry: 1, refetchInterval: 10_000 })
  const navigate = useNavigate()
  const [tab, setTab] = useState("requirements")
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [candidate, setCandidate] = useState<HighlightCandidate | undefined>()
  const duplicate = useMutation({ mutationFn: () => api.duplicateCampaign(campaignId), onSuccess: () => { toast.success("Campaign duplicated"); queryClient.invalidateQueries({ queryKey: ["campaigns"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const invalidateCampaign = () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }) }
  const archive = useMutation({ mutationFn: () => api.archiveCampaign(campaignId), onSuccess: () => { toast.success("Campaign archived"); invalidateCampaign() }, onError: (error) => toast.error(getErrorMessage(error)) })
  const restore = useMutation({ mutationFn: () => api.restoreCampaign(campaignId), onSuccess: () => { toast.success("Campaign restored"); invalidateCampaign() }, onError: (error) => toast.error(getErrorMessage(error)) })
  if (campaign.isLoading) return <LoadingPage cards={3} />
  if (campaign.isError || !campaign.data) return <ErrorState title="Campaign unavailable" message={getErrorMessage(campaign.error)} onRetry={() => campaign.refetch()} />
  const data = campaign.data
  const approvedRequirements = data.requirements?.some((revision) => revision.status === "Approved" || revision.approvedAt)
  const downloadedSources = data.sources?.filter((source) => source.status === "Downloaded" || source.localPath).length ?? 0
  const measuredReferences = data.referenceVideos?.filter((reference) => reference.status === "Analyzed").length ?? 0
  return (
    <div className="animate-enter">
      <Link to="/campaigns" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--fg-muted)] hover:text-brand-dark"><ArrowLeft className="size-3.5" /> All campaigns</Link>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold tracking-[-0.035em] text-ink md:text-[2rem]">{data.name}</h1><CampaignStatusBadge status={data.status} /></div><p className="mt-2 text-sm text-[var(--fg-body)]">{[data.brand, data.category, data.payout, data.deadline ? `Due ${formatDate(data.deadline)}` : "No deadline"].filter(Boolean).join(" · ")} · Updated {formatDate(data.updatedAt)}</p></div>
        <div className="flex flex-wrap gap-2">{data.whopUrl && <Button variant="outline" asChild><a href={data.whopUrl} target="_blank" rel="noreferrer">Campaign brief <ExternalLink /></a></Button>}<Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button><Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}><Sparkles /> Duplicate</Button>{data.status === "Archived" ? <Button variant="outline" onClick={() => restore.mutate()} disabled={restore.isPending}><RotateCcw /> Restore</Button> : <Button variant="outline" onClick={() => archive.mutate()} disabled={archive.isPending}><Archive /> Archive</Button>}<Button variant="ghost" size="icon" aria-label={`Delete ${data.name}`} onClick={() => setDeleteOpen(true)}><Trash2 /></Button></div>
      </header>

      <Card className="mb-6 overflow-hidden"><CardContent className="p-0"><div className="grid grid-cols-2 divide-x divide-y divide-[var(--border-default)] sm:grid-cols-4 sm:divide-y-0"><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Requirements</p><p className="mt-2 text-sm font-semibold">{approvedRequirements ? "Approved" : "Needs approval"}</p></div><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Platforms</p><p className="mt-2 text-sm font-semibold">{data.platformProfiles?.filter((profile) => profile.enabled).length ?? 0} enabled</p></div><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Local sources</p><p className="mt-2 text-sm font-semibold">{downloadedSources} downloaded</p></div><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Reference style</p><p className="mt-2 text-sm font-semibold">{measuredReferences ? `${measuredReferences} measured` : "Not set"}</p></div></div></CardContent></Card>

      <CampaignFormDialog open={editOpen} onOpenChange={setEditOpen} campaign={data} />
      <DeleteCampaignDialog open={deleteOpen} onOpenChange={setDeleteOpen} campaignId={campaignId} campaignName={data.name} onDeleted={() => navigate({ to: "/campaigns" })} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1"><TabsList className="min-w-max">{stages.map((stage) => <TabsTrigger key={stage.id} value={stage.id}><stage.icon />{stage.label}</TabsTrigger>)}</TabsList></div>
        <TabsContent value="requirements"><RequirementsPanel campaign={data} /></TabsContent>
        <TabsContent value="profiles"><PlatformProfilesPanel campaign={data} /></TabsContent>
        <TabsContent value="sources"><SourcesPanel campaign={data} /></TabsContent>
        <TabsContent value="reference"><ReferencePanel campaign={data} /></TabsContent>
        <TabsContent value="analysis"><AiAnalysisPanel campaign={data} selectedCandidateId={candidate?.id} onSelectCandidate={(next) => { setCandidate(next); toast.success("Highlight selected for edit plan") }} onContinue={() => setTab("edit")} /></TabsContent>
        <TabsContent value="edit"><EditPlanPanel key={candidate?.id ?? "manual"} campaign={data} candidate={candidate} /></TabsContent>
        <TabsContent value="review"><ReviewPanel campaign={data} /></TabsContent>
        <TabsContent value="publish"><CampaignPublishingPanel campaign={data} /></TabsContent>
      </Tabs>
    </div>
  )
}
