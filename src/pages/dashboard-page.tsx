import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CircleCheck, Clock3, Database, Plus, Sparkles } from "lucide-react"
import { api, getErrorMessage } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ErrorState, LoadingPage, PageHeader } from "@/components/page"
import { CampaignStatusBadge, JobStatusBadge } from "@/components/status-badge"

function StatCard({ label, value, detail, icon: Icon, tone = "green" }: { label: string; value: string | number; detail: string; icon: typeof Sparkles; tone?: "green" | "amber" | "red" | "slate" }) {
  const tones = {
    green: "bg-[var(--surface-accent)] text-[var(--brand-text)]",
    amber: "bg-[var(--surface-warning)] text-[var(--warning-text)]",
    red: "bg-[var(--surface-danger)] text-[var(--danger-text)]",
    slate: "bg-[var(--surface-subtle)] text-[var(--fg-body)]",
  }
  return (
    <Card className="animate-enter">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[var(--fg-muted)]">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">{value}</p></div><span className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="size-5" /></span></div>
        <p className="mt-4 text-xs text-[var(--fg-muted)]">{detail}</p>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, retry: 1 })
  if (dashboard.isLoading) return <LoadingPage />
  if (dashboard.isError || !dashboard.data) return <ErrorState message={getErrorMessage(dashboard.error)} onRetry={() => dashboard.refetch()} />

  const data = dashboard.data
  const totalCampaigns = Object.values(data.campaignCounts ?? {}).reduce((sum, count) => sum + (count ?? 0), 0)
  return (
    <div className="animate-enter">
      <PageHeader
        eyebrow="Good to see you"
        title="Your clipping workspace"
        description="Move from campaign requirements to a reviewed, platform-ready edit—all on this machine."
        actions={<Button variant="brand" asChild><Link to="/campaigns"><Plus /> New campaign</Link></Button>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overview">
        <StatCard label="Campaigns" value={totalCampaigns} detail={`${data.campaignCounts?.Processing ?? 0} currently processing`} icon={BriefcaseBusiness} />
        <StatCard label="Needs review" value={data.needsReview ?? data.campaignCounts?.NeedsReview ?? 0} detail="Awaiting a human decision" icon={Clock3} tone="amber" />
        <StatCard label="Active jobs" value={data.activeJobs ?? 0} detail="Downloads, AI, and renders" icon={Sparkles} tone="slate" />
        <StatCard label="Failed jobs" value={data.failedJobs ?? 0} detail="Retry from the jobs screen" icon={data.failedJobs ? AlertTriangle : CircleCheck} tone={data.failedJobs ? "red" : "green"} />
      </section>

      {/* Grid items default to min-width:auto, so nowrap content inside a card would otherwise
          set a min-content floor wider than a 320px viewport. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div><CardTitle>Recent campaigns</CardTitle><CardDescription>Pick up where you left off.</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link to="/campaigns">View all <ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent>
            {data.recentCampaigns?.length ? (
              <div className="divide-y divide-[var(--border-default)]">
                {data.recentCampaigns.slice(0, 5).map((campaign) => (
                  <Link key={campaign.id} to="/campaigns/$campaignId" params={{ campaignId: campaign.id }} className="group flex items-center gap-4 rounded-xl px-2 py-4 transition hover:bg-[var(--surface-raised)]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-accent-subtle)] text-sm font-bold text-brand-dark">{campaign.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink group-hover:text-brand-dark">{campaign.name}</p><p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{campaign.brand || campaign.category || "Uncategorized"} · Updated {formatDate(campaign.updatedAt)}</p></div>
                    <CampaignStatusBadge status={campaign.status} />
                    <ArrowRight className="hidden size-4 text-[var(--fg-subtle)] sm:block" />
                  </Link>
                ))}
              </div>
            ) : <div className="py-10 text-center text-sm text-[var(--fg-muted)]">No campaigns yet. Create your first workspace to get started.</div>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Storage</CardTitle><CardDescription>Local workspace footprint</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-3 flex items-end justify-between"><div><span className="text-2xl font-semibold tracking-tight">{formatBytes(data.storageUsedBytes)}</span><span className="ml-2 text-xs text-[var(--fg-muted)]">used</span></div><Database className="size-5 text-brand-dark" /></div>
              <Progress value={Math.min(100, data.storageUsedBytes / (100 * 1024 ** 3) * 100)} />
              <p className="mt-2 text-xs text-[var(--fg-muted)]">Measured across sources, working files, and exports.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle>Recent jobs</CardTitle></CardHeader>
            <CardContent>
              {data.recentJobs?.length ? <div className="space-y-3">{data.recentJobs.slice(0, 4).map((job) => <div key={job.id} className="flex items-center gap-3"><span className="size-1.5 shrink-0 rounded-full bg-brand" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{job.campaignName || job.type}</p><p className="truncate text-[11px] text-[var(--fg-muted)]">{job.type}</p></div><JobStatusBadge status={job.status} /></div>)}</div> : <p className="py-6 text-center text-sm text-[var(--fg-muted)]">No job activity yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
