import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CloudDownload, CloudUpload } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import type { Job } from "@/lib/types"
import { formatBytes } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

function readResult<T>(job: Job): Partial<T> {
  try { return JSON.parse(job.resultJson ?? "{}") ?? {} } catch { return {} }
}

/** How a move ended, in one or two lines, from the counts the job kept. */
export function describeDriveMove(job: Job): string {
  const result = readResult<{ clipsMoved: number; sourcesMoved: number; bytesFreed: number; keptForYouTube: number; keptRendering: number }>(job)
  const clips = result.clipsMoved ?? 0
  const sources = result.sourcesMoved ?? 0
  const kept = (result.keptForYouTube ?? 0) + (result.keptRendering ?? 0)
  const moved = [clips ? plural(clips, "clip") : null, sources ? plural(sources, "source video") : null].filter(Boolean).join(" and ")
  const stayed = kept ? ` ${plural(kept, "clip")} stayed: waiting to go up on YouTube or being re-rendered.` : ""
  if (!moved) return `Nothing was moved to Google Drive.${stayed}`
  return `Moved ${moved} to Google Drive, freeing ${formatBytes(result.bytesFreed)} on this PC.${stayed}`
}

/** How bringing back ended, in one line. */
export function describeDriveReturn(job: Job): string {
  const result = readResult<{ clipsBack: number; sourcesBack: number; bytesFetched: number }>(job)
  const back = [result.clipsBack ? plural(result.clipsBack, "clip") : null,
    result.sourcesBack ? plural(result.sourcesBack, "source video") : null].filter(Boolean).join(" and ")
  return back ? `Brought ${back} back from Google Drive (${formatBytes(result.bytesFetched)}).` : "Nothing needed bringing back."
}

/**
 * The campaign's latest move to or from Drive of one kind: the one running, if any. Keeps the clip list in step while
 * it runs and says how it ended, once, wherever the campaign page is open when it does.
 */
function useDriveJob(campaignId: string, type: "DriveUpload" | "DriveReturn", announce: (job: Job) => void) {
  const queryClient = useQueryClient()
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs(), refetchInterval: 3_000, retry: false })
  const mine = (jobs.data ?? []).filter((job) => job.campaignId === campaignId && job.type === type)
  const active = mine.find((job) => job.status === "Queued" || job.status === "Running")
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
  }
  const watching = useRef<string | null>(null)
  const lastProgress = useRef(0)
  useEffect(() => {
    if (active) {
      watching.current = active.id
      if (active.progress !== lastProgress.current) { lastProgress.current = active.progress; refresh() }
      return
    }
    const finished = mine.find((job) => job.id === watching.current)
    if (!finished) return
    watching.current = null
    announce(finished)
    refresh()
  })
  const stop = useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return { active, stop, watch: (id: string) => { watching.current = id; queryClient.invalidateQueries({ queryKey: ["jobs"] }) } }
}

function Running({ job, label, stop, icon: Icon }: {
  job: Job; label: string; stop: ReturnType<typeof useDriveJob>["stop"]; icon: typeof CloudUpload
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-semibold text-[var(--fg-strong)]">
      <Icon className="size-4 animate-pulse" />
      <span>{job.status === "Queued" ? "Waiting..." : `${label}... ${Math.round(job.progress)}%`}</span>
      <Button variant="ghost" size="sm" disabled={stop.isPending} onClick={() => stop.mutate(job.id)}>Stop</Button>
    </div>
  )
}

/**
 * Moves the whole campaign to Google Drive in one go: every source video on this PC and every finished clip. Each
 * is uploaded, checked in Drive, and only then removed here. It runs as a background job, so the page can be left.
 * Clips stay in the list by their thumbnail with Bring back; a source goes back to "not downloaded".
 */
export function CampaignDriveUpload({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const { active, stop, watch } = useDriveJob(campaignId, "DriveUpload", (job) => {
    if (job.status === "Completed") toast.success(describeDriveMove(job))
    else if (job.status === "Cancelled") toast.message("Stopped. What was already moved is in Google Drive; the rest is still on this PC.")
    else toast.error(job.errorSummary || "The move to Google Drive failed.")
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "drive-upload"] })
  })
  const summary = useQuery({
    queryKey: ["campaign", campaignId, "drive-upload"], queryFn: () => api.driveUploadSummary(campaignId),
    enabled: open, retry: false,
  })
  const start = useMutation({
    mutationFn: () => api.uploadCampaignToDrive(campaignId),
    onSuccess: (job) => {
      watch(job.id)
      setOpen(false)
      toast.success("Moving to Google Drive in the background. You can leave this page.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (active) return <Running job={active} label="Moving to Drive" stop={stop} icon={CloudUpload} />

  const found = summary.data
  const nothing = found ? found.sources + found.clips === 0 : false
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><CloudUpload /> Move campaign to Drive</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this campaign to Google Drive?</DialogTitle>
            <DialogDescription>Every source video and finished clip, in one go.</DialogDescription>
          </DialogHeader>
          {summary.isError ? <p className="text-sm text-[var(--danger-solid)]">{getErrorMessage(summary.error)}</p>
            : !found ? <p className="text-sm text-[var(--fg-muted)]">Counting the videos...</p>
            : (
              <div className="space-y-2 text-sm text-[var(--fg-body)]">
                <ul className="space-y-1">
                  <li><span className="font-semibold text-[var(--fg-strong)]">{plural(found.clips, "finished clip")}</span> ({formatBytes(found.clipBytes)})</li>
                  <li>
                    <span className="font-semibold text-[var(--fg-strong)]">{plural(found.sources, "source video")}</span> ({formatBytes(found.sourceBytes)})
                    {found.sources === 0 ? <span className="text-[var(--fg-muted)]">. None are on this PC.</span> : null}
                  </li>
                </ul>
                <p>
                  Each one is uploaded to <span className="break-all font-mono text-xs">{found.remote}</span>, checked there, and
                  then removed from this PC, freeing <span className="font-semibold text-[var(--fg-strong)]">{formatBytes(found.clipBytes + found.sourceBytes)}</span>.
                </p>
                <p>Clips stay in the list by their thumbnail, with their title and caption. "Bring back from Drive" fetches everything again, or Bring back on a clip fetches just that one.</p>
                <p className="text-[var(--fg-muted)]">A clip waiting to go up on YouTube, or being re-rendered, stays here.</p>
                {found.alreadyMoved > 0 ? <p className="text-[var(--fg-muted)]">{plural(found.alreadyMoved, "clip")} {found.alreadyMoved === 1 ? "is" : "are"} already in Drive.</p> : null}
                {found.stillWriting > 0 ? <p className="text-[var(--fg-muted)]">{plural(found.stillWriting, "file")} still being written will wait for the next move.</p> : null}
              </div>
            )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!found || nothing || start.isPending} onClick={() => start.mutate()}>
              <CloudUpload /> {start.isPending ? "Starting..." : nothing ? "Nothing to move" : "Move to Drive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Brings the whole campaign back from Google Drive in one go: every clip and source video it moved there. Each is
 * downloaded and checked before it counts as back, as a background job. The copies in Google Drive stay.
 */
export function CampaignDriveReturn({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const { active, stop, watch } = useDriveJob(campaignId, "DriveReturn", (job) => {
    if (job.status === "Completed") toast.success(describeDriveReturn(job))
    else if (job.status === "Cancelled") toast.message("Stopped. What came back is on this PC; the rest is still in Google Drive.")
    else toast.error(job.errorSummary || "Bringing the campaign back from Google Drive failed.")
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "drive-return"] })
  })
  const summary = useQuery({
    queryKey: ["campaign", campaignId, "drive-return"], queryFn: () => api.driveReturnSummary(campaignId),
    enabled: open, retry: false,
  })
  const start = useMutation({
    mutationFn: () => api.bringCampaignBackFromDrive(campaignId),
    onSuccess: (job) => {
      watch(job.id)
      setOpen(false)
      toast.success("Bringing the campaign back from Google Drive in the background. You can leave this page.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (active) return <Running job={active} label="Bringing back" stop={stop} icon={CloudDownload} />

  const found = summary.data
  const needed = found ? found.clipBytes + found.sourceBytes : 0
  const nothing = found ? found.sources + found.clips === 0 : false
  const noRoom = found ? needed > found.freeBytes : false
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><CloudDownload /> Bring back from Drive</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bring this campaign back from Google Drive?</DialogTitle>
            <DialogDescription>Every clip and source video it moved there, in one go.</DialogDescription>
          </DialogHeader>
          {summary.isError ? <p className="text-sm text-[var(--danger-solid)]">{getErrorMessage(summary.error)}</p>
            : !found ? <p className="text-sm text-[var(--fg-muted)]">Counting what is in Drive...</p>
            : nothing ? <p className="text-sm text-[var(--fg-body)]">Nothing of this campaign is in Google Drive; everything is already on this PC.</p>
            : (
              <div className="space-y-2 text-sm text-[var(--fg-body)]">
                <ul className="space-y-1">
                  <li><span className="font-semibold text-[var(--fg-strong)]">{plural(found.clips, "clip")}</span> ({formatBytes(found.clipBytes)})</li>
                  <li><span className="font-semibold text-[var(--fg-strong)]">{plural(found.sources, "source video")}</span> ({formatBytes(found.sourceBytes)})</li>
                </ul>
                <p>
                  Each one is downloaded, checked, and put back where it was, using <span className="font-semibold text-[var(--fg-strong)]">{formatBytes(needed)}</span> of
                  the {formatBytes(found.freeBytes)} free on this PC. The copies in Google Drive stay.
                </p>
                {noRoom ? <p className="text-[var(--danger-solid)]">There is not enough free space. Free some room first.</p> : null}
              </div>
            )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!found || nothing || noRoom || start.isPending} onClick={() => start.mutate()}>
              <CloudDownload /> {start.isPending ? "Starting..." : nothing ? "Nothing to bring back" : "Bring back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
