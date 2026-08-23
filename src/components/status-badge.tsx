import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle, PauseCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { CampaignStatus, JobStatus } from "@/lib/types"

const campaignMap: Record<CampaignStatus, { label: string; variant: "secondary" | "default" | "warning" | "success" }> = {
  Draft: { label: "Draft", variant: "secondary" },
  Ready: { label: "Ready", variant: "default" },
  Processing: { label: "Processing", variant: "default" },
  NeedsReview: { label: "Needs review", variant: "warning" },
  Completed: { label: "Completed", variant: "success" },
  Archived: { label: "Archived", variant: "secondary" },
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const item = campaignMap[status] ?? campaignMap.Draft
  return <Badge variant={item.variant}>{item.label}</Badge>
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  if (status === "Completed") return <Badge variant="success"><CircleCheck /> Completed</Badge>
  if (status === "Failed") return <Badge variant="destructive"><CircleAlert /> Failed</Badge>
  if (status === "Cancelled") return <Badge variant="secondary"><PauseCircle /> Cancelled</Badge>
  if (status === "Running") return <Badge variant="default"><LoaderCircle className="animate-spin" /> Running</Badge>
  return <Badge variant="secondary"><CircleDashed /> Queued</Badge>
}
