import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Archive, ArrowUpRight, Copy, Filter, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { usePagination } from "@/lib/pagination"
import type { CampaignSummary } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { CampaignFormDialog } from "@/components/campaign/campaign-form-dialog"
import { DeleteCampaignDialog } from "@/components/campaign/delete-campaign-dialog"
import { CampaignStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { EmptyState, ErrorState, LoadingPage, PageHeader, Pagination } from "@/components/page"

function CampaignRow({ campaign }: { campaign: CampaignSummary }) {
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaigns"] })
  const duplicate = useMutation({ mutationFn: () => api.duplicateCampaign(campaign.id), onSuccess: () => { toast.success("Campaign duplicated"); invalidate() }, onError: (error) => toast.error(getErrorMessage(error)) })
  const archive = useMutation({ mutationFn: () => api.archiveCampaign(campaign.id), onSuccess: () => { toast.success("Campaign archived"); invalidate() }, onError: (error) => toast.error(getErrorMessage(error)) })
  const restore = useMutation({ mutationFn: () => api.restoreCampaign(campaign.id), onSuccess: () => { toast.success("Campaign restored"); invalidate() }, onError: (error) => toast.error(getErrorMessage(error)) })
  const archived = campaign.status === "Archived"
  const facts = [
    `${campaign.platformCount ?? 0} platforms · ${campaign.sourceCount ?? 0} sources`,
    campaign.payout,
    campaign.deadline ? `Due ${formatDate(campaign.deadline)}` : "No deadline",
  ].filter(Boolean)
  return (
    <div className="grid gap-4 border-b border-[var(--border-default)] px-5 py-4 last:border-0 hover:bg-[var(--surface-accent-subtle)] md:grid-cols-[minmax(0,1.6fr)_0.8fr_0.9fr_auto] md:items-center">
      <Link to="/campaigns/$campaignId" params={{ campaignId: campaign.id }} className="group flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-accent)] text-sm font-bold text-brand-dark">{campaign.name.slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink group-hover:text-brand-dark">{campaign.name}</p>
          <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{campaign.brand || campaign.category || "No brand"} · {campaign.campaignType || "Clipping"}</p>
        </div>
      </Link>
      <div><CampaignStatusBadge status={campaign.status} /></div>
      {/* min-w-0 keeps the truncated lines from setting a 320px min-content floor on the grid column. */}
      <div className="min-w-0 text-xs text-[var(--fg-muted)]">
        <p className="truncate">{facts[0]}</p>
        <p className="mt-1 truncate">{facts.slice(1).join(" · ")} · Updated {formatDate(campaign.updatedAt)}</p>
      </div>
      <div className="flex items-center gap-1 md:justify-end">
        <Button variant="ghost" size="icon" aria-label={`Edit ${campaign.name}`} onClick={() => setEditOpen(true)}><Pencil /></Button>
        <Button variant="ghost" size="icon" aria-label={`Duplicate ${campaign.name}`} onClick={() => duplicate.mutate()} disabled={duplicate.isPending}><Copy /></Button>
        {archived
          ? <Button variant="ghost" size="icon" aria-label={`Restore ${campaign.name}`} onClick={() => restore.mutate()} disabled={restore.isPending}><RotateCcw /></Button>
          : <Button variant="ghost" size="icon" aria-label={`Archive ${campaign.name}`} onClick={() => archive.mutate()} disabled={archive.isPending}><Archive /></Button>}
        <Button variant="ghost" size="icon" aria-label={`Delete ${campaign.name}`} onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
        <Button variant="ghost" size="icon" asChild><Link to="/campaigns/$campaignId" params={{ campaignId: campaign.id }} aria-label={`Open ${campaign.name}`}><ArrowUpRight /></Link></Button>
      </div>
      <CampaignFormDialog open={editOpen} onOpenChange={setEditOpen} campaign={campaign} />
      <DeleteCampaignDialog open={deleteOpen} onOpenChange={setDeleteOpen} campaignId={campaign.id} campaignName={campaign.name} />
    </div>
  )
}

const CAMPAIGNS_PER_PAGE = 25

export function CampaignsPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const campaigns = useQuery({ queryKey: ["campaigns", { showArchived }], queryFn: () => api.campaigns(showArchived), retry: 1 })
  const filtered = useMemo(() => (campaigns.data ?? []).filter((campaign) => `${campaign.name} ${campaign.brand ?? ""} ${campaign.category ?? ""}`.toLowerCase().includes(query.toLowerCase())), [campaigns.data, query])
  const paged = usePagination(filtered, CAMPAIGNS_PER_PAGE, `${query}|${showArchived}`)

  return (
    <div className="animate-enter">
      <PageHeader eyebrow="Campaign library" title="Campaigns" description="Every brief, source, analysis, and export lives in its own local workspace." actions={<Button variant="brand" onClick={() => setCreateOpen(true)}><Plus /> New campaign</Button>} />
      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(campaign) => navigate({ to: "/campaigns/$campaignId", params: { campaignId: campaign.id } })} />

      {campaigns.isLoading ? <LoadingPage cards={3} /> : campaigns.isError ? <ErrorState message={getErrorMessage(campaigns.error)} onRetry={() => campaigns.refetch()} /> : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns…" aria-label="Search campaigns" /></div>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-panel px-3 py-2"><Filter className="size-4 text-[var(--fg-muted)]" /><Label htmlFor="archived" className="text-xs">Include archived</Label><Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} /></div>
            </div>
            {filtered.length ? <><div>{paged.items.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />)}</div><Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPageChange={paged.setPage} noun="campaigns" /></> : <div className="p-5"><EmptyState title={query ? "No campaigns match" : "Create your first campaign"} description={query ? "Try a different campaign, brand, or category." : "Paste a campaign brief to create a structured, reviewable clipping workspace."} action={!query ? <Button variant="brand" onClick={() => setCreateOpen(true)}><Plus /> New campaign</Button> : undefined} /></div>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
