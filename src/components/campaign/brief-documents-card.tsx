import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FileText, Globe, Info, LoaderCircle, Paperclip, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { ACCEPTED_DOCUMENT_TYPES, api, getErrorMessage, MAX_DOCUMENT_BYTES } from "@/lib/api"
import type { CampaignDocument } from "@/lib/types"
import { formatBytes, formatDate } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"

const kindLabels: Record<CampaignDocument["kind"], string> = { Pdf: "PDF", Word: "Word", Text: "Text", Markdown: "Markdown", Html: "Web page" }

function DocumentRow({ campaignId, document }: { campaignId: string; document: CampaignDocument }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
  const toggle = useMutation({
    mutationFn: (include: boolean) => api.updateCampaignDocument(campaignId, document.id, include),
    onSuccess: (updated) => { toast.success(updated.includeInExtraction ? `${updated.fileName} will be extracted` : `${updated.fileName} excluded from extraction`); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteCampaignDocument(campaignId, document.id),
    onSuccess: () => { toast.success(`${document.fileName} removed`); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const failed = document.extractionStatus === "Failed"
  const page = document.kind === "Html"
  const details = [
    page ? null : formatBytes(document.sizeBytes),
    document.pageCount ? `${document.pageCount} page${document.pageCount === 1 ? "" : "s"}` : null,
    failed ? null : `${document.extractedCharacterCount.toLocaleString()} characters extracted`,
    `Added ${formatDate(document.uploadedAt)}`,
  ].filter(Boolean).join(" · ")
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-accent-subtle)] p-4">
      <div className="flex flex-wrap items-start gap-3">
        {page ? <Globe className="mt-0.5 size-4 shrink-0 text-brand-dark" /> : <FileText className="mt-0.5 size-4 shrink-0 text-brand-dark" />}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{document.fileName}</span>
            <Badge variant="secondary">{kindLabels[document.kind] ?? document.kind}</Badge>
            {failed && <Badge variant="warning">No text</Badge>}
          </div>
          <p className="text-xs text-[var(--fg-muted)]">{details}</p>
          {failed && document.extractionError && <p className="mt-2 text-xs leading-relaxed text-[var(--warning-text)]">{document.extractionError}</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--fg-body)]">
            <Switch checked={document.includeInExtraction} disabled={failed || toggle.isPending} onCheckedChange={(checked) => toggle.mutate(checked)} aria-label={`Include ${document.fileName} in extraction`} />
            Extract
          </label>
          <Button variant="ghost" size="icon" aria-label={`Remove ${document.fileName}`} onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 /></Button>
        </div>
      </div>
    </div>
  )
}

export function BriefDocumentsCard({ campaignId, documents }: { campaignId: string; documents: CampaignDocument[] }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ fileName: string; percent: number } | null>(null)
  const [url, setUrl] = useState("")
  const fetchPage = useMutation({
    mutationFn: (value: string) => api.fetchBriefPage(campaignId, value),
    onSuccess: (result) => {
      if (result.warning) toast.warning(result.warning)
      else toast.success(`${result.document.fileName} read — ${result.document.extractedCharacterCount.toLocaleString()} characters`)
      setUrl("")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
      // The page's links become importable sources, so refresh that card too.
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "detected-links"] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const warnings: string[] = []
      for (const file of files) {
        setProgress({ fileName: file.name, percent: 0 })
        const result = await api.uploadCampaignDocument(campaignId, file, (percent) => setProgress({ fileName: file.name, percent }))
        if (result.warning) warnings.push(`${file.name}: ${result.warning}`)
      }
      return warnings
    },
    onSuccess: (warnings) => {
      if (warnings.length) warnings.forEach((warning) => toast.warning(warning))
      else toast.success("Brief attached")
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { setProgress(null); if (inputRef.current) inputRef.current.value = "" },
  })
  const extracted = documents.filter((document) => document.includeInExtraction && document.extractionStatus === "Extracted")
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Attached brief files</CardTitle>
          <CardDescription>Point it at the campaign page, or upload the PDF. Either way the text joins the pasted brief before extraction.</CardDescription>
        </div>
        <Paperclip className="size-5 text-brand-dark" />
      </CardHeader>
      <CardContent>
        <input ref={inputRef} type="file" multiple className="hidden" accept={ACCEPTED_DOCUMENT_TYPES}
          onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) upload.mutate(files) }} />
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (url.trim()) fetchPage.mutate(url.trim()) }}>
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <Input className="pl-9" placeholder="https://reachclipping.com/…" aria-label="Campaign page address"
              value={url} onChange={(event) => setUrl(event.target.value)} disabled={fetchPage.isPending} />
          </div>
          <Button type="submit" variant="brand" disabled={fetchPage.isPending || !url.trim()}>
            {fetchPage.isPending ? <LoaderCircle className="animate-spin" /> : <Globe />} {fetchPage.isPending ? "Reading…" : "Read page"}
          </Button>
        </form>
        <p className="mt-2 text-xs leading-relaxed text-[var(--fg-muted)]">Reads the page itself, so every link keeps the exact address it was published with and sections you never scrolled to are captured too. Pages that build their content with JavaScript, or sit behind a login, need the brief pasted instead.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border-default)] pt-4">
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            <Upload /> {upload.isPending ? "Uploading…" : "Upload brief file"}
          </Button>
          <span className="text-xs text-[var(--fg-muted)]">PDF, Word (.docx), .txt, or .md up to {MAX_DOCUMENT_BYTES / 1024 ** 2} MB each.</span>
        </div>
        {progress && (
          <div className="mt-4">
            <p className="mb-1.5 truncate text-xs text-[var(--fg-body)]">{progress.fileName} — {progress.percent}%</p>
            <Progress value={progress.percent} />
          </div>
        )}
        {documents.length > 0 && (
          <div className="mt-4 space-y-3">
            {documents.map((document) => <DocumentRow key={document.id} campaignId={campaignId} document={document} />)}
          </div>
        )}
        <Alert className="mt-4">
          <span className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {extracted.length
                ? `${extracted.length} attached file${extracted.length === 1 ? "" : "s"} will be appended to the pasted brief the next time you run extraction. Scanned, image-only PDFs need OCR first.`
                : "Attached text is appended to the pasted brief the next time you run extraction. Scanned, image-only PDFs have no text layer and need OCR first."}
            </span>
          </span>
        </Alert>
      </CardContent>
    </Card>
  )
}
