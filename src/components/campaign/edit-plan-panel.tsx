import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Captions, Film, Layers3, Play, Save, SlidersHorizontal, Volume2, WandSparkles } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { api, getErrorMessage } from "@/lib/api"
import type { CampaignDetail, EditPlan, HighlightCandidate, Platform } from "@/lib/types"
import { formatDuration } from "@/lib/utils"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, FieldError } from "@/components/page"

const planSchema = z.object({
  name: z.string().min(2), sourceAssetId: z.string().min(1, "Choose a source."), platform: z.enum(["TikTok", "InstagramReels", "YouTubeShorts", "X"]),
  startSeconds: z.number().min(0), endSeconds: z.number().positive(), width: z.number().int().min(240), height: z.number().int().min(240), fps: z.number().int().min(15).max(120),
  framing: z.string().min(1), subtitleEnabled: z.boolean(), subtitleStyle: z.string(), subtitleRelativePath: z.string(), musicAssetId: z.string(), musicVolume: z.number().min(0).max(1), normalizeAudio: z.boolean(), musicDuckingDb: z.number().min(-40).max(0), sfxAssetId: z.string(), sfxAtSeconds: z.number().min(0), sfxGainDb: z.number().min(-60).max(12), overlayText: z.string(),
}).refine((value) => value.endSeconds > value.startSeconds, { message: "End time must be after the start time.", path: ["endSeconds"] })
type PlanValues = z.infer<typeof planSchema>

function defaultPlan(campaign: CampaignDetail, candidate?: HighlightCandidate): PlanValues {
  const profile = campaign.platformProfiles?.find((item) => item.enabled && item.platform === candidate?.platform) ?? campaign.platformProfiles?.find((item) => item.enabled) ?? campaign.platformProfiles?.[0]
  const recommendation = candidate?.editRecommendation
  const firstEffect = recommendation?.soundEffects?.[0]
  return {
    name: candidate ? `${candidate.title} — ${profile?.platform ?? "TikTok"}` : "New vertical edit",
    sourceAssetId: campaign.sources?.find((item) => item.status === "Downloaded" || item.localPath)?.id ?? "",
    platform: candidate?.platform ?? profile?.platform ?? "TikTok", startSeconds: candidate?.startSeconds ?? 0, endSeconds: candidate?.endSeconds ?? 30,
    width: recommendation?.width ?? profile?.width ?? 1080, height: recommendation?.height ?? profile?.height ?? 1920, fps: recommendation?.framesPerSecond ?? 30, framing: recommendation?.framing ?? "SmartCrop", subtitleEnabled: recommendation?.burnSubtitles ?? profile?.burnSubtitles ?? true,
    subtitleStyle: recommendation?.subtitleStyle ?? profile?.subtitleStyle ?? "Bold white with highlighted keywords", subtitleRelativePath: recommendation?.subtitleRelativePath ?? "", musicAssetId: recommendation?.musicAssetId ?? "none", musicVolume: recommendation?.musicVolume ?? 0.16, normalizeAudio: true, musicDuckingDb: recommendation?.musicDuckingDb ?? -12,
    sfxAssetId: firstEffect?.assetId ?? "none", sfxAtSeconds: firstEffect?.atSeconds ?? 1, sfxGainDb: firstEffect?.gainDb ?? 0, overlayText: recommendation?.overlayText ?? profile?.cta ?? "",
  }
}

export function EditPlanPanel({ campaign, candidate }: { campaign: CampaignDetail; candidate?: HighlightCandidate }) {
  const queryClient = useQueryClient()
  const [savedPlan, setSavedPlan] = useState<EditPlan | null>(campaign.editPlans?.[0] ?? null)
  const form = useForm<PlanValues>({ resolver: zodResolver(planSchema), defaultValues: defaultPlan(campaign, candidate) })
  const audio = useQuery({ queryKey: ["media-assets"], queryFn: () => api.mediaAssets(), retry: false })
  const create = useMutation({
    mutationFn: ({ values, isApproved }: { values: PlanValues; isApproved: boolean }) => api.createEditPlan(campaign.id, {
      ...values, campaignId: campaign.id, highlightCandidateId: candidate?.id, musicAssetId: values.musicAssetId === "none" ? null : values.musicAssetId, subtitleRelativePath: values.subtitleRelativePath || null,
      soundEffects: values.sfxAssetId === "none" ? [] : [{ assetId: values.sfxAssetId, atSeconds: values.sfxAtSeconds, gainDb: values.sfxGainDb }],
      overlays: values.overlayText ? [{ type: "CTA", text: values.overlayText, atSeconds: Math.max(0, values.endSeconds - values.startSeconds - 3) }] : [],
    }, isApproved),
    onSuccess: (plan) => { setSavedPlan(plan); toast.success("Edit plan saved"); queryClient.invalidateQueries({ queryKey: ["campaign", campaign.id] }) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const render = useMutation({ mutationFn: (planId: string) => api.renderEditPlan(planId), onSuccess: () => { toast.success("Render queued"); queryClient.invalidateQueries({ queryKey: ["jobs"] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const saveAndRender = form.handleSubmit(async (values) => {
    try {
      const plan = await create.mutateAsync({ values, isApproved: true })
      await render.mutateAsync(plan.id)
    } catch { /* Mutations surface their own error toast. */ }
  })
  const start = Number(form.watch("startSeconds")) || 0
  const end = Number(form.watch("endSeconds")) || 0
  const musicId = form.watch("musicAssetId")
  const selectedMusic = audio.data?.find((asset) => asset.id === musicId)
  if (!campaign.sources?.some((source) => source.status === "Downloaded" || source.localPath)) return <EmptyState title="Download a source first" description="An edit plan needs a local source file with verified timing and media metadata." icon={<Film className="size-6" />} />
  return (
    <div className="space-y-5">
      {candidate ? <Alert tone="success"><span className="flex gap-2"><WandSparkles className="mt-0.5 size-4 shrink-0" /><span>Prefilled from <strong>{candidate.provider}</strong> candidate “{candidate.title}” at {formatDuration(candidate.startSeconds)}–{formatDuration(candidate.endSeconds)}. Every setting remains editable.</span></span></Alert> : <Alert>Selecting a ranked highlight will prefill timestamps, hook context, and recommended treatment. You can also build a plan manually.</Alert>}
      <form onSubmit={form.handleSubmit((values) => create.mutate({ values, isApproved: false }))}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Card><CardHeader><CardTitle>Clip and output</CardTitle><CardDescription>Deterministic inputs used to build the FFmpeg command.</CardDescription></CardHeader><CardContent className="space-y-5">
              <div><Label>Plan name</Label><Input className="mt-1.5" {...form.register("name")} /></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><Label>Source</Label><Select value={form.watch("sourceAssetId")} onValueChange={(value) => form.setValue("sourceAssetId", value)}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose source" /></SelectTrigger><SelectContent>{campaign.sources.filter((source) => source.status === "Downloaded" || source.localPath).map((source) => <SelectItem key={source.id} value={source.id}>{source.title}</SelectItem>)}</SelectContent></Select><FieldError>{form.formState.errors.sourceAssetId?.message}</FieldError></div><div><Label>Platform</Label><Select value={form.watch("platform")} onValueChange={(value) => { const platform = value as Platform; const profile = campaign.platformProfiles.find((item) => item.platform === platform); form.setValue("platform", platform); if (profile) { form.setValue("width", profile.width); form.setValue("height", profile.height) } }}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{campaign.platformProfiles.filter((item) => item.enabled).map((profile) => <SelectItem key={profile.platform} value={profile.platform}>{profile.platform.replace(/([a-z])([A-Z])/g, "$1 $2")}</SelectItem>)}</SelectContent></Select></div></div>
              <div><div className="mb-2 flex items-center justify-between"><Label>Source time range</Label><Badge variant="secondary">{formatDuration(Math.max(0, end - start))}</Badge></div><div className="grid gap-4 sm:grid-cols-2"><div><Label className="text-xs font-medium">Start (seconds)</Label><Input className="mt-1.5" type="number" step="0.1" {...form.register("startSeconds", { valueAsNumber: true })} /></div><div><Label className="text-xs font-medium">End (seconds)</Label><Input className="mt-1.5" type="number" step="0.1" {...form.register("endSeconds", { valueAsNumber: true })} /><FieldError>{form.formState.errors.endSeconds?.message}</FieldError></div></div><div className="mt-4 h-10 rounded-xl bg-[var(--surface-muted)] p-1"><div className="flex h-full items-center rounded-lg bg-gradient-to-r from-[var(--surface-accent)] to-brand px-3 text-xs font-semibold text-[var(--brand-text)] shadow-sm" style={{ width: `${Math.min(100, Math.max(15, (end - start) / 60 * 100))}%` }}>{formatDuration(start)} → {formatDuration(end)}</div></div></div>
              <div className="grid gap-4 sm:grid-cols-4"><div><Label>Width</Label><Input className="mt-1.5" type="number" {...form.register("width", { valueAsNumber: true })} /></div><div><Label>Height</Label><Input className="mt-1.5" type="number" {...form.register("height", { valueAsNumber: true })} /></div><div><Label>FPS</Label><Input className="mt-1.5" type="number" {...form.register("fps", { valueAsNumber: true })} /></div><div><Label>Framing</Label><Select value={form.watch("framing")} onValueChange={(value) => form.setValue("framing", value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SmartCrop">Smart crop</SelectItem><SelectItem value="CenterCrop">Center crop</SelectItem><SelectItem value="Fit">Fit to frame</SelectItem><SelectItem value="Letterbox">Letterbox</SelectItem></SelectContent></Select></div></div>
            </CardContent></Card>

            <Card><CardHeader><CardTitle>Subtitles and overlays</CardTitle><CardDescription>Review AI treatments before they reach the typed render plan.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between rounded-xl border border-[var(--border-default)] p-4"><div className="flex items-center gap-3"><Captions className="size-5 text-brand-dark" /><div><p className="text-sm font-semibold">Burn in subtitles</p><p className="mt-1 text-xs text-[var(--fg-muted)]">Keep the editable subtitle file alongside the export.</p></div></div><Switch checked={form.watch("subtitleEnabled")} onCheckedChange={(checked) => form.setValue("subtitleEnabled", checked)} /></div><div><Label>Subtitle file <span className="font-normal text-[var(--fg-muted)]">workspace-relative path</span></Label><Input className="mt-1.5 font-mono text-xs" placeholder="campaigns/.../subtitles/clip.srt" {...form.register("subtitleRelativePath")} disabled={!form.watch("subtitleEnabled")} /></div><div><Label>Subtitle treatment</Label><Input className="mt-1.5" {...form.register("subtitleStyle")} disabled={!form.watch("subtitleEnabled")} /></div><div><Label>CTA overlay text</Label><Textarea className="mt-1.5 min-h-20" placeholder="Optional final-frame or lower-third CTA" {...form.register("overlayText")} /></div></CardContent></Card>

            <Card><CardHeader><CardTitle>Audio treatment</CardTitle><CardDescription>Only assets in your approved local library can enter this typed plan.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label>Background music</Label><Select value={musicId} onValueChange={(value) => form.setValue("musicAssetId", value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No background music</SelectItem>{audio.data?.filter((asset) => asset.type === "Music").map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>)}</SelectContent></Select>{selectedMusic && <p className="mt-2 text-xs text-[var(--fg-muted)]">{selectedMusic.mood || "Untagged"} · {selectedMusic.bpm ? `${selectedMusic.bpm} BPM` : "BPM unknown"}</p>}</div><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]"><div><div className="mb-2 flex justify-between"><Label>Music volume</Label><span className="text-xs font-semibold">{Math.round(Number(form.watch("musicVolume")) * 100)}%</span></div><input className="w-full accent-[var(--brand-strong)]" type="range" min="0" max="0.5" step="0.01" {...form.register("musicVolume", { valueAsNumber: true })} disabled={musicId === "none"} /></div><div><Label>Dialogue ducking (dB)</Label><Input className="mt-1.5" type="number" min="-40" max="0" step="1" {...form.register("musicDuckingDb", { valueAsNumber: true })} disabled={musicId === "none"} /></div></div><div className="flex items-center justify-between rounded-xl border border-[var(--border-default)] p-4"><div className="flex items-center gap-3"><Volume2 className="size-5 text-brand-dark" /><div><p className="text-sm font-semibold">Normalize speech audio</p><p className="mt-1 text-xs text-[var(--fg-muted)]">Apply loudness normalization to the clip audio.</p></div></div><Switch checked={form.watch("normalizeAudio")} onCheckedChange={(checked) => form.setValue("normalizeAudio", checked)} /></div><div className="border-t border-[var(--border-default)] pt-4"><p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Layers3 className="size-4 text-brand-dark" /> Sound effect cue</p><div className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-3"><Label>Sound effect</Label><Select value={form.watch("sfxAssetId")} onValueChange={(value) => form.setValue("sfxAssetId", value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No sound effect</SelectItem>{audio.data?.filter((asset) => asset.type === "SoundEffect").map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>)}</SelectContent></Select></div><div><Label>At clip second</Label><Input className="mt-1.5" type="number" step="0.1" {...form.register("sfxAtSeconds", { valueAsNumber: true })} disabled={form.watch("sfxAssetId") === "none"} /></div><div><Label>Gain (dB)</Label><Input className="mt-1.5" type="number" step="0.5" {...form.register("sfxGainDb", { valueAsNumber: true })} disabled={form.watch("sfxAssetId") === "none"} /></div></div></div></CardContent></Card>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <Card className="overflow-hidden"><div className="bg-sidebar p-5 text-white"><div className="mx-auto aspect-[9/16] w-44 overflow-hidden rounded-[1.5rem] border-4 border-[var(--border-inverse)] bg-gradient-to-br from-[var(--surface-inverse-raised)] to-[var(--surface-inverse)] shadow-2xl"><div className="flex h-full flex-col justify-between p-4"><div className="flex justify-between text-[7px] text-white/50"><span>PREVIEW</span><span>{form.watch("platform")}</span></div><div className="space-y-2 text-center"><div className="mx-auto h-2 w-28 rounded bg-panel" /><div className="mx-auto h-2 w-20 rounded bg-brand" /><div className="mx-auto h-2 w-24 rounded bg-panel" /></div><div className="rounded bg-black/25 p-2 text-center text-[7px] text-white/70">{form.watch("overlayText") || "CTA overlay"}</div></div></div></div><CardContent className="p-5"><div className="space-y-3 text-xs"><div className="flex justify-between"><span className="text-[var(--fg-muted)]">Canvas</span><span className="font-semibold">{form.watch("width")} × {form.watch("height")}</span></div><div className="flex justify-between"><span className="text-[var(--fg-muted)]">Duration</span><span className="font-semibold">{formatDuration(end - start)}</span></div><div className="flex justify-between"><span className="text-[var(--fg-muted)]">Framing</span><span className="font-semibold">{form.watch("framing")}</span></div><div className="flex justify-between"><span className="text-[var(--fg-muted)]">Subtitles</span><span className="font-semibold">{form.watch("subtitleEnabled") ? "Burned in" : "Off"}</span></div></div></CardContent></Card>
            {savedPlan?.ffmpegPreview && <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><SlidersHorizontal className="size-4" /> Command preview</CardTitle></CardHeader><CardContent><pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-inverse)] p-3 font-mono text-[10px] leading-relaxed text-[var(--brand-text-soft)]">{savedPlan.ffmpegPreview}</pre></CardContent></Card>}
            <div className="grid gap-2"><Button type="submit" variant="outline" disabled={create.isPending}><Save /> {create.isPending ? "Saving…" : "Save edit plan"}</Button><Button type="button" variant="brand" onClick={saveAndRender} disabled={create.isPending || render.isPending}><Play /> {render.isPending ? "Queuing render…" : "Approve & render"}</Button></div>
            <p className="text-center text-[11px] leading-relaxed text-[var(--fg-muted)]">Rendering is deterministic. Saving creates an auditable plan before FFmpeg runs.</p>
          </aside>
        </div>
      </form>
    </div>
  )
}
