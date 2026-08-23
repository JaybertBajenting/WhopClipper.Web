import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Permanent campaign deletion. It removes the database rows and the campaign's workspace
 * folder, so the name must be typed to confirm rather than relying on a single click.
 */
export function DeleteCampaignDialog({
  open, onOpenChange, campaignId, campaignName, onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  campaignName: string
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState("")
  // Clearing on close means the next open always starts empty, without an effect.
  const setOpen = (next: boolean) => { if (!next) setConfirmation(""); onOpenChange(next) }

  const remove = useMutation({
    mutationFn: () => api.deleteCampaign(campaignId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      queryClient.removeQueries({ queryKey: ["campaign", campaignId] })
      if (result?.warning) toast.warning(result.warning)
      else toast.success(`${campaignName} deleted`)
      setOpen(false)
      onDeleted?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const confirmed = confirmation.trim() === campaignName.trim()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{campaignName}” permanently?</DialogTitle>
          <DialogDescription>Archiving is reversible; this is not.</DialogDescription>
        </DialogHeader>
        <Alert tone="error">
          <span className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>This removes the campaign, its requirement revisions, platform profiles, sources, briefs, reference videos, edit plans, analyses, and job history — plus the campaign folder in your workspace, including downloaded media and renders.</span>
          </span>
        </Alert>
        <div>
          <Label htmlFor="delete-confirmation">Type <span className="font-semibold text-ink">{campaignName}</span> to confirm</Label>
          <Input id="delete-confirmation" className="mt-1.5" value={confirmation} autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)} placeholder={campaignName} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={!confirmed || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
