import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, FolderX, RefreshCw, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { OrphanedCampaignFolder } from "@/lib/types"
import { formatBytes, formatDate } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function OrphanRow({ folder }: { folder: OrphanedCampaignFolder }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () => api.deleteOrphanedCampaignFolder(folder.folderName),
    onSuccess: () => {
      toast.success(`Removed ${formatBytes(folder.sizeBytes)} of leftover media`)
      queryClient.invalidateQueries({ queryKey: ["orphaned-campaign-folders"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (error) => { setConfirming(false); toast.error(getErrorMessage(error)) },
  })
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-default)] p-4">
      <FolderX className="size-4 shrink-0 text-[var(--warning-text)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-[var(--fg-body)]">{folder.folderName}</p>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          {formatBytes(folder.sizeBytes)} · {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"} · last written {formatDate(folder.lastModified)}
        </p>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--danger-text)]">Delete for good?</span>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={remove.isPending}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}><Trash2 /> Delete</Button>
      )}
    </div>
  )
}

/**
 * Campaign media nothing owns any more. Deleting a campaign removes its rows first and its folder
 * second, so a folder held open by another program is left behind with nothing pointing at it -
 * invisible disk, on a workspace where one source can be twelve gigabytes.
 */
export function OrphanedFoldersCard() {
  const queryClient = useQueryClient()
  const orphans = useQuery({ queryKey: ["orphaned-campaign-folders"], queryFn: api.orphanedCampaignFolders, retry: 1 })
  const total = (orphans.data ?? []).reduce((sum, folder) => sum + folder.sizeBytes, 0)
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Leftover campaign media</CardTitle>
          <CardDescription>
            Deleting a campaign removes its folder too. If a file was open at the time the folder survives, and nothing in the app points at it afterwards.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" aria-label="Rescan for leftover media"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["orphaned-campaign-folders"] })}>
          <RefreshCw className={orphans.isFetching ? "animate-spin" : undefined} />
        </Button>
      </CardHeader>
      <CardContent>
        {orphans.isLoading ? (
          <p className="py-4 text-center text-sm text-[var(--fg-muted)]">Scanning the workspace…</p>
        ) : orphans.isError ? (
          <Alert tone="error">{getErrorMessage(orphans.error)}</Alert>
        ) : orphans.data?.length ? (
          <div className="space-y-3">
            <Alert tone="warning">
              <span className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {orphans.data.length} folder{orphans.data.length === 1 ? "" : "s"} holding {formatBytes(total)} that no campaign owns.
                  Deleting one removes its downloaded media and finished clips permanently.
                </span>
              </span>
            </Alert>
            {orphans.data.map((folder) => <OrphanRow key={folder.folderName} folder={folder} />)}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-2 text-sm text-[var(--fg-body)]">
            <CheckCircle2 className="size-4 text-brand-dark" /> Nothing left over. Every campaign folder belongs to a campaign.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
