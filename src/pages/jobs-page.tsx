import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Ban, CircleAlert, Clock3, Eye, ListFilter, RefreshCw, RotateCcw, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { Job, JobStatus } from "@/lib/types"
import { usePagination } from "@/lib/pagination"
import { formatDate } from "@/lib/utils"
import { JobStatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, ErrorState, LoadingPage, PageHeader, Pagination } from "@/components/page"

const JOBS_PER_PAGE = 25
/** Kept in step with the server default in `api.jobs`. */
const JOB_HISTORY_LIMIT = 200

function JobActions({ job }: { job: Job }) {
  const queryClient = useQueryClient()
  const cancel = useMutation({ mutationFn: () => api.cancelJob(job.id), onSuccess: () => { toast.success("Cancellation requested"); queryClient.invalidateQueries({ queryKey: ["jobs"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const retry = useMutation({ mutationFn: () => api.retryJob(job.id), onSuccess: () => { toast.success("Job queued for retry"); queryClient.invalidateQueries({ queryKey: ["jobs"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  if (job.status === "Running" || job.status === "Queued") return <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}><Ban /> Cancel</Button>
  if (job.status === "Failed" || job.status === "Cancelled") return <Button variant="outline" size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}><RotateCcw /> Retry</Button>
  return null
}

function JobDetail({ jobId, open, onOpenChange }: { jobId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const job = useQuery({ queryKey: ["job", jobId], queryFn: () => api.job(jobId), enabled: open, refetchInterval: (query) => query.state.data?.status === "Running" ? 1_500 : false })
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Job details</DialogTitle><DialogDescription>Process state and safe, redacted execution output.</DialogDescription></DialogHeader>{job.data ? <div className="space-y-5"><div className="flex items-center justify-between"><div><p className="text-lg font-semibold">{job.data.type}</p><p className="mt-1 text-xs text-[var(--fg-muted)]">{job.data.campaignName || "System job"}</p></div><JobStatusBadge status={job.data.status} /></div><div><div className="mb-2 flex justify-between text-xs"><span>{job.data.message || "Waiting for progress…"}</span><span className="font-semibold">{Math.round(job.data.progress)}%</span></div><Progress value={job.data.progress} /></div><dl className="grid gap-3 rounded-xl bg-[var(--surface-subtle)] p-4 text-xs sm:grid-cols-2"><div><dt className="text-[var(--fg-muted)]">Created</dt><dd className="mt-1 font-semibold">{formatDate(job.data.createdAt, true)}</dd></div><div><dt className="text-[var(--fg-muted)]">Provider</dt><dd className="mt-1 font-semibold">{job.data.provider || "Local process"}</dd></div><div className="sm:col-span-2"><dt className="text-[var(--fg-muted)]">Output</dt><dd className="mt-1 break-all font-mono">{job.data.outputPath || "Pending"}</dd></div></dl>{job.data.errorSummary && <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--danger-text)]">Error summary</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-inverse)] p-4 font-mono text-xs leading-relaxed text-[var(--danger-text-soft)]">{job.data.errorSummary}</pre></div>}<div className="flex justify-end"><JobActions job={job.data} /></div></div> : <div className="py-12 text-center text-sm text-[var(--fg-muted)]">Loading job…</div>}</DialogContent></Dialog>
}

function JobRow({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)
  return <><div className="grid gap-4 border-b border-[var(--border-default)] px-5 py-4 last:border-0 lg:grid-cols-[minmax(0,1.2fr)_0.55fr_1fr_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{job.campaignName || job.type}</p><Badge variant="secondary">{job.type.replace(/([a-z])([A-Z])/g, "$1 $2")}</Badge></div>{job.subjectName ? <p className="mt-1 truncate text-xs font-medium text-[var(--fg-body)]" title={job.subjectName}>{job.subjectName}</p> : null}<p className="mt-1 truncate text-xs text-[var(--fg-muted)]">{job.message || `Created ${formatDate(job.createdAt, true)}`}</p></div><JobStatusBadge status={job.status} /><div><div className="mb-1.5 flex justify-between text-[11px] text-[var(--fg-muted)]"><span>{job.status === "Completed" ? "Complete" : job.status === "Failed" ? "Stopped" : "Progress"}</span><span>{Math.round(job.progress)}%</span></div><Progress value={job.progress} /></div><div className="flex items-center justify-end gap-1"><JobActions job={job} /><Button variant="ghost" size="icon" aria-label="View job details" onClick={() => setOpen(true)}><Eye /></Button></div></div><JobDetail jobId={job.id} open={open} onOpenChange={setOpen} /></>
}

export function JobsPage() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<JobStatus | "All">("All")
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs(), refetchInterval: 2_000, retry: 1 })
  const filtered = useMemo(() => (jobs.data ?? []).filter((job) => (status === "All" || job.status === status) && `${job.campaignName ?? ""} ${job.subjectName ?? ""} ${job.type} ${job.message ?? ""}`.toLowerCase().includes(query.toLowerCase())), [jobs.data, query, status])
  // Filtered first, then paged, so a search covers every job the list holds rather than only
  // whichever ones happened to be on screen.
  const paged = usePagination(filtered, JOBS_PER_PAGE, `${query}|${status}`)
  if (jobs.isLoading) return <LoadingPage cards={3} />
  if (jobs.isError) return <ErrorState message={getErrorMessage(jobs.error)} onRetry={() => jobs.refetch()} />
  const active = jobs.data?.filter((job) => job.status === "Running" || job.status === "Queued").length ?? 0
  const failed = jobs.data?.filter((job) => job.status === "Failed").length ?? 0
  // A soft signal, not an exact one: with exactly the limit’s worth of jobs this says there are
  // more when there are not. An exact answer needs a total in the response, which means an
  // envelope instead of an array and two other callers changed, for a line of text.
  const truncated = (jobs.data?.length ?? 0) >= JOB_HISTORY_LIMIT
  return <div className="animate-enter"><PageHeader eyebrow="Process history" title="Jobs" description="Downloads, transcription, AI analysis, FFmpeg renders, validation, and exports continue in the local background queue." actions={<Button variant="outline" onClick={() => jobs.refetch()}><RefreshCw /> Refresh</Button>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-[var(--surface-accent)] p-3 text-brand-dark"><Sparkles className="size-5" /></span><div><p className="text-2xl font-semibold">{active}</p><p className="text-xs text-[var(--fg-muted)]">Active or queued</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-[var(--surface-danger)] p-3 text-[var(--danger-text)]"><CircleAlert className="size-5" /></span><div><p className="text-2xl font-semibold">{failed}</p><p className="text-xs text-[var(--fg-muted)]">Needs attention</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-[var(--surface-subtle)] p-3 text-[var(--fg-body)]"><Clock3 className="size-5" /></span><div><p className="text-2xl font-semibold">{jobs.data?.length ?? 0}</p><p className="text-xs text-[var(--fg-muted)]">Total recorded</p></div></CardContent></Card></div>
    <Card><CardContent className="p-0"><div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" /><Input className="pl-9" placeholder="Search campaign, source, type, or message…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><Select value={status} onValueChange={(value) => setStatus(value as JobStatus | "All")}><SelectTrigger className="sm:w-48"><ListFilter className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="All">All statuses</SelectItem><SelectItem value="Queued">Queued</SelectItem><SelectItem value="Running">Running</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Failed">Failed</SelectItem><SelectItem value="Cancelled">Cancelled</SelectItem></SelectContent></Select></div>{filtered.length ? <div>{paged.items.map((job) => <JobRow key={job.id} job={job} />)}</div> : <div className="p-5"><EmptyState title="No jobs found" description={jobs.data?.length ? "Adjust your filters to see more process history." : "Downloads, AI analyses, renders, and exports will appear here."} /></div>}<Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} from={paged.from} to={paged.to} onPageChange={paged.setPage} noun="jobs" />{truncated && <p className="border-t border-[var(--border-default)] px-5 py-3 text-xs text-[var(--fg-muted)]">Showing the most recent {JOB_HISTORY_LIMIT} jobs. Older ones are still on disk but are not listed here.</p>}</CardContent></Card>
  </div>
}
