import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Download, ExternalLink, LoaderCircle, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { DetectedLink } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const copy = {
  source: {
    title: "Videos found in your brief",
    description: "Footage the campaign brief already links to. Pick what to download and edit — no need to retype anything.",
    action: "Add & download",
    permission: "I confirm these are provided by the campaign, or I otherwise have permission to download and edit them.",
  },
  reference: {
    title: "Videos found in your brief",
    description: "Clips the campaign brief already links to. Pick which ones to measure as style references.",
    action: "Add as reference",
    permission: "I confirm I am allowed to download these clips for style reference.",
  },
} as const

export function DetectedLinksCard({ campaignId, target }: { campaignId: string; target: "source" | "reference" }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const [permission, setPermission] = useState(false)
  const [download, setDownload] = useState(true)
  const text = copy[target]

  const links = useQuery({
    queryKey: ["campaign", campaignId, "detected-links"],
    queryFn: () => api.detectedLinks(campaignId),
    retry: 1,
  })

  // Only video links are offered. Brand kits, campaign pages, and chat invites appear in
  // briefs too, and none of them are something this app should download.
  const candidates = useMemo(
    () => (links.data ?? []).filter((link) => link.kind === "Media"),
    [links.data],
  )
  const isAdded = (link: DetectedLink) => (target === "source" ? link.alreadySource : link.alreadyReference)
  const pending = candidates.filter((link) => !isAdded(link))

  const importLinks = useMutation({
    mutationFn: (urls: string[]) => api.importDetectedLinks(campaignId, urls, target, download),
    onSuccess: (result) => {
      if (result.added) toast.success(`${result.added} ${target === "source" ? "source" : "reference"}${result.added === 1 ? "" : "s"} added${result.queued ? `, ${result.queued} download${result.queued === 1 ? "" : "s"} queued` : ""}`)
      if (result.skipped) toast.info(`${result.skipped} already added`)
      result.errors.forEach((error) => toast.error(error))
      setSelected([])
      setPermission(false)
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "detected-links"] })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (links.isLoading) return null
  if (!candidates.length) return null

  const toggle = (url: string) => setSelected((current) => current.includes(url) ? current.filter((item) => item !== url) : [...current, url])
  // With nothing ticked the button imports everything, so the default path is one press.
  const toImport = selected.length ? selected : pending.map((link) => link.url)
  const importsAll = selected.length === 0

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2"><CardTitle>{text.title}</CardTitle><Badge variant="default">{pending.length} new</Badge></div>
          <CardDescription>{text.description}</CardDescription>
        </div>
        <Sparkles className="size-5 shrink-0 text-brand-dark" />
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {candidates.map((link) => {
            const added = isAdded(link)
            const checked = selected.includes(link.url)
            return (
              <li key={link.url} className={`rounded-xl border p-3 transition ${added ? "border-[var(--border-default)] bg-[var(--surface-subtle)] opacity-70" : checked ? "border-[var(--border-accent)] bg-[var(--surface-accent-subtle)]" : "border-[var(--border-default)] bg-[var(--surface-raised)]"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  {added
                    ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--brand-text)]" />
                    : <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--brand-strong)]" checked={checked} onChange={() => toggle(link.url)} aria-label={`${text.action}: ${link.url}`} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{link.host}</span>
                      <Badge variant="secondary">Video</Badge>
                      {added && <Badge variant="success">Added</Badge>}
                      {link.occurrences > 1 && <span className="text-[11px] text-[var(--fg-muted)]">×{link.occurrences}</span>}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[11px] text-[var(--fg-muted)]" title={link.url}>{link.url}</span>
                    {link.context && <span className="mt-1.5 block border-l-2 border-[var(--border-strong)] pl-2 text-xs italic leading-relaxed text-[var(--fg-body)]">{link.context}</span>}
                  </span>
                  <a href={link.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}
                    className="shrink-0 rounded-lg p-1.5 text-[var(--fg-muted)] transition hover:bg-[var(--surface-muted)] hover:text-ink" aria-label={`Open ${link.url}`}>
                    <ExternalLink className="size-4" />
                  </a>
                </label>
              </li>
            )
          })}
        </ul>

        {pending.length > 0 && (
          <div className="mt-4 space-y-3">
            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--fg-muted)]">{selected.length} of {pending.length} selected</span>
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
              </div>
            )}
            <p className="text-xs text-[var(--fg-muted)]">Tick individual videos only if you want a subset — otherwise the button below takes all {pending.length}.</p>
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-[var(--fg-body)]">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--brand-strong)]" checked={permission} onChange={(event) => setPermission(event.target.checked)} />
              <span>{text.permission}</span>
            </label>
            {target === "source" && (
              <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-[var(--fg-body)]">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--brand-strong)]" checked={download} onChange={(event) => setDownload(event.target.checked)} />
                <span>Download the footage straight away. Full stream VODs can be many gigabytes each; downloads run one at a time and can be cancelled from the Jobs page.</span>
              </label>
            )}
            <div className="flex justify-end">
              <Button variant="brand" disabled={!permission || importLinks.isPending} onClick={() => importLinks.mutate(toImport)}>
                {importLinks.isPending ? <LoaderCircle className="animate-spin" /> : <Download />}
                {importLinks.isPending
                  ? "Adding…"
                  : `${target === "source" && !download ? "Add" : text.action} ${importsAll ? `all ${pending.length}` : `(${selected.length})`}`}
              </Button>
            </div>
          </div>
        )}

        {pending.length === 0 && (
          <Alert className="mt-4">Every video linked in the brief has already been added.</Alert>
        )}
      </CardContent>
    </Card>
  )
}
