import { useEffect, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { FileText, Globe, Paperclip, Upload, X } from "lucide-react"
import { ACCEPTED_DOCUMENT_TYPES, api, getErrorMessage, MAX_DOCUMENT_BYTES, type CreateCampaignInput } from "@/lib/api"
import type { CampaignDetail, CampaignSummary } from "@/lib/types"
import { formatBytes } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FieldError } from "@/components/page"

// Number inputs hand back strings, and keeping the schema's input and output types
// identical is what lets the resolver type-check.
const optionalNumber = z
  .string()
  .trim()
  .refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0), "Enter a positive number.")

const campaignSchema = z.object({
  name: z.string().trim().min(2, "Enter a campaign name."),
  whopUrl: z.union([z.literal(""), z.url("Enter a valid URL.")]),
  brand: z.string().trim().optional(),
  category: z.string().trim().optional(),
  campaignType: z.enum(["Clipping", "UGC"]),
  payoutAmount: optionalNumber,
  payoutPerViews: optionalNumber,
  noDeadline: z.boolean(),
  deadline: z.string().optional(),
  rawInstructions: z.string().trim(),
  // Mirrors the attached-file count so the requirement below stays declarative.
  hasAttachment: z.boolean(),
  /** Whether the address above will be read for the brief, which is a third way to supply one. */
  readPage: z.boolean(),
  notes: z.string().trim().optional(),
}).refine((values) => values.noDeadline || Boolean(values.deadline), {
  message: "Pick a deadline or switch on “No deadline”.",
  path: ["deadline"],
}).refine((values) => values.rawInstructions.length >= 10 || values.hasAttachment
  || (values.readPage && values.whopUrl !== ""), {
  message: "Give the brief one of three ways: paste it, attach a PDF or Word file, or enter the campaign page address above and leave “Read this page” ticked.",
  path: ["rawInstructions"],
})

export type CampaignFormValues = z.infer<typeof campaignSchema>

/** `<input type="date">` needs a bare yyyy-mm-dd, in local time so the day does not shift. */
function toDateInputValue(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function toDefaults(campaign?: CampaignDetail | CampaignSummary | null): CampaignFormValues {
  return {
    name: campaign?.name ?? "",
    whopUrl: campaign?.whopUrl ?? "",
    brand: campaign?.brand ?? "",
    category: campaign?.category ?? "",
    campaignType: (campaign?.campaignType === "UGC" ? "UGC" : "Clipping"),
    payoutAmount: campaign?.payoutAmount == null ? "" : String(campaign.payoutAmount),
    payoutPerViews: campaign?.payoutPerViews == null ? (campaign ? "" : "1000") : String(campaign.payoutPerViews),
    noDeadline: campaign ? !campaign.deadline : false,
    deadline: toDateInputValue(campaign?.deadline),
    rawInstructions: (campaign as CampaignDetail | undefined)?.rawInstructions ?? "",
    hasAttachment: Boolean((campaign as CampaignDetail | undefined)?.documents?.length),
    // On by default when creating, so pasting an address is enough. Never on when editing: an
    // existing workspace re-reads its page from the Requirements tab, deliberately.
    readPage: !campaign,
    notes: (campaign as CampaignDetail | undefined)?.notes ?? "",
  }
}

function toInput(values: CampaignFormValues): CreateCampaignInput {
  const amount = values.payoutAmount.trim() === "" ? null : Number(values.payoutAmount)
  const perViews = values.payoutPerViews.trim() === "" ? null : Math.round(Number(values.payoutPerViews))
  return {
    name: values.name,
    whopUrl: values.whopUrl,
    brand: values.brand,
    category: values.category,
    campaignType: values.campaignType,
    payoutAmount: amount,
    // A view threshold only means something alongside an amount.
    payoutPerViews: amount == null ? null : perViews,
    payoutUnit: null,
    deadline: values.noDeadline ? null : values.deadline || null,
    rawInstructions: values.rawInstructions,
    notes: values.notes,
  }
}

export function CampaignFormDialog({
  open, onOpenChange, campaign, onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omit to create; pass a campaign to edit it. */
  campaign?: CampaignDetail | CampaignSummary | null
  onCreated?: (campaign: CampaignDetail) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(campaign)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [upload, setUpload] = useState<{ fileName: string; percent: number } | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const form = useForm<CampaignFormValues>({ resolver: zodResolver(campaignSchema), defaultValues: toDefaults(campaign) })
  const noDeadline = form.watch("noDeadline")
  const payoutAmount = form.watch("payoutAmount")
  const whopUrl = form.watch("whopUrl")

  useEffect(() => {
    if (!open) return
    form.reset(toDefaults(campaign))
    setFiles([])
    setUpload(null)
    setReading(null)
    // Re-seeding on open keeps an edit dialog in step with refreshed campaign data.
  }, [open, campaign, form])

  const attach = (incoming: File[]) => {
    const accepted: File[] = []
    for (const file of incoming) {
      if (file.size > MAX_DOCUMENT_BYTES) { toast.error(`${file.name} is larger than the ${MAX_DOCUMENT_BYTES / 1024 ** 2} MB brief limit.`); continue }
      accepted.push(file)
    }
    if (!accepted.length) return
    setFiles((current) => {
      const next = [...current, ...accepted.filter((file) => !current.some((existing) => existing.name === file.name && existing.size === file.size))]
      form.setValue("hasAttachment", next.length > 0)
      form.clearErrors("rawInstructions")
      return next
    })
  }

  const detach = (name: string, size: number) => setFiles((current) => {
    const next = current.filter((file) => !(file.name === name && file.size === size))
    form.setValue("hasAttachment", next.length > 0 || Boolean((campaign as CampaignDetail | undefined)?.documents?.length))
    return next
  })

  // The upload endpoint needs a campaign id, so files are held until the campaign exists.
  const save = useMutation({
    mutationFn: async (values: CampaignFormValues) => {
      const saved = campaign
        ? await api.updateCampaign(campaign.id, toInput(values))
        : await api.createCampaign(toInput(values))
      const warnings: string[] = []

      // The address is read only once the campaign exists, because the document it becomes belongs
      // to that campaign. A read that fails must not take the workspace down with it: a 404 or a
      // JavaScript-only page should leave a usable workspace and an explanation, not nothing.
      const readsPage = !campaign && values.readPage && values.whopUrl !== ""
      if (readsPage) {
        setReading(values.whopUrl)
        try {
          const result = await api.fetchBriefPage(saved.id, values.whopUrl)
          if (result.warning) warnings.push(result.warning)
        } catch (error) {
          warnings.push(`The campaign page could not be read: ${getErrorMessage(error)} The workspace was created; paste the brief or attach a file instead.`)
        }
        setReading(null)
      }

      for (const file of files) {
        setUpload({ fileName: file.name, percent: 0 })
        try {
          const result = await api.uploadCampaignDocument(saved.id, file, (percent) => setUpload({ fileName: file.name, percent }))
          if (result.warning) warnings.push(`${file.name}: ${result.warning}`)
        } catch (error) {
          warnings.push(`${file.name}: ${getErrorMessage(error)}`)
        }
      }
      setUpload(null)
      // Refetched whenever anything was attached, or the workspace opens without the brief it was
      // just given.
      return { campaign: files.length || readsPage ? await api.campaign(saved.id) : saved, warnings }
    },
    onSuccess: async ({ campaign: saved, warnings }) => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      if (campaign) await queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] })
      toast.success(isEdit ? "Campaign updated" : "Campaign workspace created")
      warnings.forEach((warning) => toast.warning(warning))
      onOpenChange(false)
      if (!isEdit) onCreated?.(saved)
    },
    onError: (error) => { setUpload(null); setReading(null); toast.error(getErrorMessage(error)) },
  })

  const formId = isEdit ? "edit-campaign" : "create-campaign"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit campaign" : "Create campaign workspace"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the campaign details. Approved requirement revisions stay untouched."
              : "Give the campaign page address, paste the requirements, or attach the brief as a PDF or Word file. You can review every extracted field before it drives an edit."}
          </DialogDescription>
        </DialogHeader>
        <form id={formId} className="space-y-5" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input id="campaign-name" className="mt-1.5" placeholder="e.g. Founder Podcast Clips" autoFocus {...form.register("name")} />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="whop-url">Campaign page URL <span className="font-normal text-[var(--fg-muted)]">(optional)</span></Label>
              <Input id="whop-url" className="mt-1.5" placeholder="https://whop.com/… or any campaign page" {...form.register("whopUrl")} />
              <FieldError>{form.formState.errors.whopUrl?.message}</FieldError>
              {!isEdit && (
                <>
                  <label className={`mt-2.5 flex items-start gap-2.5 text-xs leading-relaxed ${whopUrl.trim() ? "cursor-pointer text-[var(--fg-body)]" : "text-[var(--fg-muted)]"}`}>
                    <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--brand-strong)]"
                      disabled={!whopUrl.trim() || save.isPending}
                      checked={form.watch("readPage")}
                      onChange={(event) => { form.setValue("readPage", event.target.checked); form.clearErrors("rawInstructions") }} />
                    <span>Read this page for requirements and source links. Its text is attached to the workspace, so the box below can stay empty.</span>
                  </label>
                  {reading && <p className="mt-2 flex items-center gap-2 text-xs text-[var(--fg-body)]"><Globe className="size-3.5 shrink-0 animate-pulse" />Reading {reading}…</p>}
                </>
              )}
            </div>
            <div>
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" className="mt-1.5" placeholder="Creator or company" {...form.register("brand")} />
            </div>
            <div>
              <Label>Campaign type</Label>
              <Select value={form.watch("campaignType")} onValueChange={(value) => form.setValue("campaignType", value as "Clipping" | "UGC")}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Clipping">Clipping</SelectItem><SelectItem value="UGC">UGC</SelectItem></SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="payout-amount">Payout</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="relative w-32">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--fg-muted)]">$</span>
                  <Input id="payout-amount" className="pl-7" type="number" min="0" step="0.01" placeholder="1.00" {...form.register("payoutAmount")} />
                </div>
                <span className="text-sm text-[var(--fg-body)]">per</span>
                <Input
                  className="w-32"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1000"
                  aria-label="Views the payout applies to"
                  disabled={payoutAmount.trim() === ""}
                  {...form.register("payoutPerViews")}
                />
                <span className="text-sm text-[var(--fg-body)]">views</span>
              </div>
              <p className="mt-1.5 text-xs text-[var(--fg-muted)]">Leave the amount empty if this campaign has no view-based reward.</p>
              <FieldError>{form.formState.errors.payoutAmount?.message ?? form.formState.errors.payoutPerViews?.message}</FieldError>
            </div>

            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-48 flex-1">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input id="deadline" type="date" className="mt-1.5" disabled={noDeadline} {...form.register("deadline")} />
                </div>
                <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-[var(--fg-body)]">
                  <Switch
                    checked={noDeadline}
                    onCheckedChange={(checked) => {
                      form.setValue("noDeadline", checked)
                      if (checked) form.setValue("deadline", "")
                      form.clearErrors("deadline")
                    }}
                    aria-label="No deadline"
                  />
                  No deadline
                </label>
              </div>
              <FieldError>{form.formState.errors.deadline?.message}</FieldError>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="instructions">Campaign requirements</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={save.isPending}>
                <Paperclip /> Attach PDF or Word
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept={ACCEPTED_DOCUMENT_TYPES}
              onChange={(event) => { attach(Array.from(event.target.files ?? [])); event.target.value = "" }}
            />
            <Textarea id="instructions" className="mt-1.5 min-h-40" placeholder="Paste the campaign brief, account requirements, caption rules, source links, and prohibited content — or attach the brief file above." {...form.register("rawInstructions")} />
            <FieldError>{form.formState.errors.rawInstructions?.message}</FieldError>

            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2.5">
                    <FileText className="size-4 shrink-0 text-brand-dark" />
                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                    <span className="shrink-0 text-xs text-[var(--fg-muted)]">{formatBytes(file.size)}</span>
                    <button type="button" onClick={() => detach(file.name, file.size)} disabled={save.isPending}
                      className="shrink-0 rounded-lg p-1 text-[var(--fg-muted)] transition hover:bg-[var(--surface-muted)] hover:text-ink disabled:opacity-50"
                      aria-label={`Remove ${file.name}`}>
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {upload && (
              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-2 truncate text-xs text-[var(--fg-body)]"><Upload className="size-3.5 shrink-0" />Uploading {upload.fileName} — {upload.percent}%</p>
                <Progress value={upload.percent} />
              </div>
            )}

            <p className="mt-2 text-xs text-[var(--fg-muted)]">
              A read page and any attached text are appended to whatever is pasted above, then read when you run extraction. PDF, Word (.docx), .txt, or .md up to {MAX_DOCUMENT_BYTES / 1024 ** 2} MB each.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="brand" type="submit" form={formId} disabled={save.isPending}>
            {save.isPending ? (reading ? "Reading page…" : upload ? "Uploading…" : isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save changes" : "Create workspace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
