import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, FolderOpen, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Media the user downloaded themselves. Some sites refuse automated downloads, so a
 * manually placed file has to be a supported way of getting footage into a campaign.
 */
const copy = {
  source: {
    title: "Footage you downloaded yourself",
    description: "Drop video files into this campaign's source folder and register them here. Nothing is copied or moved.",
    label: "Campaign source folder",
  },
  reference: {
    title: "Reference clips you downloaded yourself",
    description: "Drop reference videos into this campaign's reference folder. Each one is measured for pacing and style after scanning.",
    label: "Campaign reference folder",
  },
} as const

export function LocalSourcesCard({ campaignId, target = "source" }: { campaignId: string; target?: "source" | "reference" }) {
  const text = copy[target]
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const folder = useQuery({
    queryKey: ["campaign", campaignId, "local-folder", target],
    queryFn: () => target === "source" ? api.localSourceFolder(campaignId) : api.localReferenceFolder(campaignId),
    staleTime: 5 * 60_000,
  })

  const scan = useMutation({
    mutationFn: () => target === "source" ? api.scanLocalSources(campaignId) : api.scanLocalReferences(campaignId),
    onSuccess: (result) => {
      const linked = result.attached + result.added
      if (linked === 0 && result.alreadyKnown === 0) toast.info(`No video files found in the campaign ${target} folder yet.`)
      else if (linked === 0) toast.info(`No new files — ${result.alreadyKnown} already registered.`)
      else toast.success(`${linked} file${linked === 1 ? "" : "s"} registered${result.attached ? ` (${result.attached} matched to existing sources)` : ""}`)
      result.notes.slice(0, 6).forEach((note) => toast.message(note))
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const path = folder.data?.folder ?? ""
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Could not copy the path. Select it manually instead.")
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{text.title}</CardTitle>
          <CardDescription>{text.description}</CardDescription>
        </div>
        <FolderOpen className="size-5 shrink-0 text-brand-dark" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">{text.label}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-[11px]" title={path}>
              {folder.isLoading ? "Loading…" : path || "Unavailable"}
            </code>
            <Button variant="outline" size="sm" onClick={copyPath} disabled={!path}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy path"}
            </Button>
          </div>
        </div>

        <Alert>
          Keep the site's video id in the file name (for example <span className="font-mono text-xs">…-0xkq-BbzKrw.mp4</span>) and each file
          links itself to the matching source automatically. A <span className="font-mono text-xs">.srt</span> beside it is picked up as the transcript.
        </Alert>

        <div className="flex justify-end">
          <Button variant="brand" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className={scan.isPending ? "animate-spin" : undefined} />
            {scan.isPending ? "Scanning…" : "Scan folder for videos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
