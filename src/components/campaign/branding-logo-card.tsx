import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Info, Stamp, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { ACCEPTED_LOGO_TYPES, api, getErrorMessage, MAX_LOGO_BYTES } from "@/lib/api"
import type { CampaignBranding } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

const positions: CampaignBranding["position"][] = ["Top", "Center", "Bottom"]
const percent = (value: number) => `${Math.round(value * 100)}%`

/** Values only, so an unrelated campaign refetch does not throw away sliders mid-drag. */
const signatureOf = (branding?: CampaignBranding | null) => branding
  ? [branding.logoRelativePath, branding.position, branding.widthFraction, branding.marginFraction, branding.opacity, branding.enabled].join("|")
  : ""

/**
 * Campaign branding is a payout condition on most clipping briefs, so the logo is set once here
 * and burned into every render rather than picked per clip. The preview is a proportional stand-in,
 * not a frame grab - it shows where the mark lands in a 9:16 frame at the current settings.
 */
export function BrandingLogoCard({ campaignId, branding }: { campaignId: string; branding?: CampaignBranding | null }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [draft, setDraft] = useState<CampaignBranding | null>(branding ?? null)
  const signature = signatureOf(branding)
  const [syncedSignature, setSyncedSignature] = useState(signature)
  if (signature !== syncedSignature) { setSyncedSignature(signature); setDraft(branding ?? null) }
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadCampaignLogo(campaignId, file, setProgress),
    onSuccess: (saved) => {
      toast.success(saved.logoCropRect ? "Logo attached; transparent padding trimmed" : "Logo attached")
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { setProgress(null); if (inputRef.current) inputRef.current.value = "" },
  })

  const save = useMutation({
    mutationFn: (next: CampaignBranding) => api.updateCampaignBranding(campaignId, {
      position: next.position, widthFraction: next.widthFraction,
      marginFraction: next.marginFraction, opacity: next.opacity, enabled: next.enabled,
    }),
    onSuccess: () => { toast.success("Logo placement saved"); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteCampaignLogo(campaignId),
    onSuccess: () => { toast.success("Logo removed"); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const busy = upload.isPending || save.isPending || remove.isPending
  const dirty = Boolean(draft && branding && (
    draft.position !== branding.position || draft.widthFraction !== branding.widthFraction ||
    draft.marginFraction !== branding.marginFraction || draft.opacity !== branding.opacity ||
    draft.enabled !== branding.enabled))

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Client logo</CardTitle>
          <CardDescription>Burned into every clip this campaign renders. Briefs that require a logo on every post treat a clip without one as unsubmittable.</CardDescription>
        </div>
        <Stamp className="size-5 text-brand-dark" />
      </CardHeader>
      <CardContent>
        <input ref={inputRef} type="file" className="hidden" accept={ACCEPTED_LOGO_TYPES}
          onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file) }} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload /> {upload.isPending ? "Uploading…" : draft?.logoFileName ? "Replace logo" : "Upload logo"}
          </Button>
          {draft?.logoFileName && (
            <Button variant="ghost" size="icon" aria-label="Remove logo" onClick={() => remove.mutate()} disabled={busy}><Trash2 /></Button>
          )}
          <span className="text-xs text-[var(--fg-muted)]">Transparent PNG or WebP up to {MAX_LOGO_BYTES / 1024 ** 2} MB.</span>
        </div>
        {progress !== null && <div className="mt-4"><Progress value={progress} /></div>}

        {draft?.logoFileName && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-accent-subtle)] p-4">
              <span className="truncate text-sm font-semibold text-ink">{draft.logoFileName}</span>
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--fg-body)]">
                <Switch checked={draft.enabled} disabled={busy} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} aria-label="Burn the logo into renders" />
                Burn in
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]">Position</label>
                  <Select value={draft.position} onValueChange={(value) => setDraft({ ...draft, position: value as CampaignBranding["position"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{positions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]" htmlFor="logo-width">Width — {percent(draft.widthFraction)} of frame</label>
                  <input id="logo-width" type="range" min={10} max={90} value={Math.round(draft.widthFraction * 100)} className="w-full"
                    onChange={(event) => setDraft({ ...draft, widthFraction: Number(event.target.value) / 100 })} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]" htmlFor="logo-margin">Margin — {percent(draft.marginFraction)} from edge</label>
                  <input id="logo-margin" type="range" min={0} max={45} value={Math.round(draft.marginFraction * 100)} disabled={draft.position === "Center"} className="w-full"
                    onChange={(event) => setDraft({ ...draft, marginFraction: Number(event.target.value) / 100 })} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--fg-strong)]" htmlFor="logo-opacity">Opacity — {percent(draft.opacity)}</label>
                  <input id="logo-opacity" type="range" min={10} max={100} value={Math.round(draft.opacity * 100)} className="w-full"
                    onChange={(event) => setDraft({ ...draft, opacity: Number(event.target.value) / 100 })} />
                </div>
              </div>

              <div className="mx-auto flex w-[135px] flex-col">
                <div className="relative h-[240px] w-[135px] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-accent-subtle)]">
                  <div className="absolute inset-x-0 bottom-0 h-[17%] bg-[var(--border-default)]/40" />
                  <div className="absolute left-1/2 -translate-x-1/2 rounded-sm bg-brand-dark"
                    style={{
                      width: `${draft.widthFraction * 100}%`, height: "7%", opacity: draft.opacity,
                      ...(draft.position === "Top" ? { top: `${draft.marginFraction * 100}%` }
                        : draft.position === "Center" ? { top: "46.5%" }
                        : { bottom: `${draft.marginFraction * 100}%` }),
                    }} />
                </div>
                <p className="mt-1.5 text-center text-[10px] text-[var(--fg-muted)]">9:16 · shaded band is platform UI</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={() => draft && save.mutate(draft)} disabled={!dirty || busy}>
                {save.isPending ? "Saving…" : "Save placement"}
              </Button>
              {dirty && <span className="text-xs text-[var(--fg-muted)]">Unsaved changes</span>}
            </div>
          </>
        )}

        <Alert className="mt-4">
          <span className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {draft?.logoCropRect
                ? `Transparent padding was trimmed to ${draft.logoCropRect.split(":").slice(0, 2).join(" × ")} px, so a full-frame logo sheet is placed by its artwork rather than stretched to fit.`
                : "Upload the mark on a transparent background. Padding is measured on upload so a full-frame logo sheet is placed by its artwork rather than stretched across the clip."}
            </span>
          </span>
        </Alert>
      </CardContent>
    </Card>
  )
}
