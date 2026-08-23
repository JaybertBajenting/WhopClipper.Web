import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Captions, Check, Info, MonitorSmartphone, Plus, Save } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { api, getErrorMessage } from "@/lib/api"
import type { CampaignDetail, Platform, PlatformProfile } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, FieldError } from "@/components/page"

const platforms: Platform[] = ["TikTok", "InstagramReels", "YouTubeShorts", "X"]
const labels: Record<Platform, string> = { TikTok: "TikTok", InstagramReels: "Instagram Reels", YouTubeShorts: "YouTube Shorts", X: "X" }
/** Starting points for a profile added by hand, used when extraction missed a platform. */
const platformDefaults: Record<Platform, { width: number; height: number; min: number; preferred: number; max: number }> = {
  TikTok: { width: 1080, height: 1920, min: 15, preferred: 30, max: 60 },
  InstagramReels: { width: 1080, height: 1920, min: 15, preferred: 30, max: 90 },
  YouTubeShorts: { width: 1080, height: 1920, min: 15, preferred: 30, max: 60 },
  X: { width: 1080, height: 1920, min: 5, preferred: 30, max: 140 },
}
function ratio(width: number, height: number) { if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "—"; const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a; const divisor = gcd(width, height); return `${width / divisor}:${height / divisor}` }

const profileSchema = z.object({
  enabled: z.boolean(), width: z.number().int().min(240), height: z.number().int().min(240),
  minDurationSeconds: z.number().min(1), preferredDurationSeconds: z.number().min(1), maxDurationSeconds: z.number().min(1),
  maxFileSizeMb: z.union([z.literal(""), z.number().positive()]), captionTemplate: z.string(), hashtags: z.string(), mentions: z.string(), disclosure: z.string(), cta: z.string(), burnSubtitles: z.boolean(), safeAreaNotes: z.string(),
}).refine((value) => value.minDurationSeconds <= value.preferredDurationSeconds && value.preferredDurationSeconds <= value.maxDurationSeconds, { message: "Durations must be ordered minimum, preferred, then maximum.", path: ["preferredDurationSeconds"] })

type ProfileValues = z.infer<typeof profileSchema>

function ProfileEditor({ campaignId, profile }: { campaignId: string; profile: PlatformProfile }) {
  const queryClient = useQueryClient()
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: {
    enabled: profile.enabled, width: profile.width, height: profile.height,
    minDurationSeconds: profile.minDurationSeconds, preferredDurationSeconds: profile.preferredDurationSeconds, maxDurationSeconds: profile.maxDurationSeconds,
    maxFileSizeMb: profile.maxFileSizeMb ?? "", captionTemplate: profile.captionTemplate ?? "", hashtags: (profile.hashtags ?? []).join(", "), mentions: (profile.mentions ?? []).join(", "), disclosure: profile.disclosure ?? "", cta: profile.cta ?? "", burnSubtitles: profile.burnSubtitles ?? true, safeAreaNotes: profile.safeAreaNotes ?? "",
  } })
  const save = useMutation({ mutationFn: (values: ProfileValues) => api.updatePlatformProfile(campaignId, profile.platform, {
    ...profile, ...values, maxFileSizeMb: values.maxFileSizeMb === "" ? null : Number(values.maxFileSizeMb), hashtags: values.hashtags.split(",").map((value) => value.trim()).filter(Boolean), mentions: values.mentions.split(",").map((value) => value.trim()).filter(Boolean), origin: "UserOverride",
  }), onSuccess: () => { toast.success(`${labels[profile.platform]} profile saved`); queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className="flex items-center justify-between rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"><div><p className="text-sm font-semibold">Include {labels[profile.platform]}</p><p className="mt-1 text-xs text-[var(--fg-muted)]">Disabled profiles are excluded from AI plans and exports.</p></div><Switch checked={form.watch("enabled")} onCheckedChange={(checked) => form.setValue("enabled", checked)} /></div>
      <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MonitorSmartphone className="size-4 text-brand-dark" /> Output format</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Width</Label><Input className="mt-1.5" type="number" {...form.register("width", { valueAsNumber: true })} /></div><div><Label>Height</Label><Input className="mt-1.5" type="number" {...form.register("height", { valueAsNumber: true })} /></div><div><Label>Aspect ratio</Label><Input className="mt-1.5" value={ratio(form.watch("width"), form.watch("height"))} readOnly aria-readonly="true" title="Calculated from width and height" /></div><div><Label>Max file size (MB)</Label><Input className="mt-1.5" type="number" placeholder="No limit" {...form.register("maxFileSizeMb", { setValueAs: (value) => value === "" ? "" : Number(value) })} /></div></div></section>
      <section><h3 className="mb-3 text-sm font-semibold">Duration window</h3><div className="grid gap-4 sm:grid-cols-3"><div><Label>Minimum seconds</Label><Input className="mt-1.5" type="number" {...form.register("minDurationSeconds", { valueAsNumber: true })} /></div><div><Label>Preferred seconds</Label><Input className="mt-1.5" type="number" {...form.register("preferredDurationSeconds", { valueAsNumber: true })} /><FieldError>{form.formState.errors.preferredDurationSeconds?.message}</FieldError></div><div><Label>Maximum seconds</Label><Input className="mt-1.5" type="number" {...form.register("maxDurationSeconds", { valueAsNumber: true })} /></div></div></section>
      <section><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Captions className="size-4 text-brand-dark" /> Publishing copy</h3><div className="space-y-4"><div><Label>Caption template</Label><Textarea className="mt-1.5 min-h-28" placeholder="Write or paste the required caption structure…" {...form.register("captionTemplate")} /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Hashtags <span className="font-normal text-[var(--fg-muted)]">comma-separated</span></Label><Input className="mt-1.5" placeholder="#brand, #podcast" {...form.register("hashtags")} /></div><div><Label>Mentions <span className="font-normal text-[var(--fg-muted)]">comma-separated</span></Label><Input className="mt-1.5" placeholder="@creator, @brand" {...form.register("mentions")} /></div><div><Label>Call to action</Label><Input className="mt-1.5" {...form.register("cta")} /></div><div><Label>Disclosure</Label><Input className="mt-1.5" {...form.register("disclosure")} /></div></div></div></section>
      <section><h3 className="mb-3 text-sm font-semibold">Visual rules</h3><div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border-default)] p-4"><div><p className="text-sm font-semibold">Burn in subtitles</p><p className="mt-1 text-xs text-[var(--fg-muted)]">Use the campaign transcript and safe-area rules.</p></div><Switch checked={form.watch("burnSubtitles")} onCheckedChange={(checked) => form.setValue("burnSubtitles", checked)} /></div><div><Label>Safe-area notes</Label><Input className="mt-1.5" placeholder="Keep text above bottom UI…" {...form.register("safeAreaNotes")} /></div><p className="mt-2 text-xs text-[var(--fg-muted)]">Subtitle styling and overlays are configured per clip in the edit plan.</p></section>
      <div className="flex justify-end"><Button variant="brand" type="submit" disabled={save.isPending}><Save /> {save.isPending ? "Saving…" : "Save profile"}</Button></div>
    </form>
  )
}

function AddPlatformRow({ campaignId, missing, onAdded }: { campaignId: string; missing: Platform[]; onAdded: (platform: Platform) => void }) {
  const queryClient = useQueryClient()
  const add = useMutation({
    mutationFn: (platform: Platform) => {
      const defaults = platformDefaults[platform]
      return api.updatePlatformProfile(campaignId, platform, {
        platform, enabled: true, width: defaults.width, height: defaults.height, aspectRatio: ratio(defaults.width, defaults.height),
        minDurationSeconds: defaults.min, preferredDurationSeconds: defaults.preferred, maxDurationSeconds: defaults.max,
        maxFileSizeMb: null, captionTemplate: "", hashtags: [], mentions: [], disclosure: "", cta: "",
        burnSubtitles: true, safeAreaNotes: "Keep key text within the central 80% of the frame.", complianceChecklist: [],
      })
    },
    onSuccess: (profile) => { toast.success(`${labels[profile.platform]} profile added`); queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }); onAdded(profile.platform) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  if (!missing.length) return null
  return (
    <div className="border-t border-[var(--border-default)] pt-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Add a platform</p>
      <div className="space-y-1">
        {missing.map((platform) => (
          <button key={platform} type="button" onClick={() => add.mutate(platform)} disabled={add.isPending}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--fg-body)] transition hover:bg-[var(--surface-subtle)] disabled:opacity-50">
            <Plus className="size-4 shrink-0 text-brand-dark" />
            <span className="flex-1">{labels[platform]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function PlatformProfilesPanel({ campaign }: { campaign: CampaignDetail }) {
  const available = campaign.platformProfiles ?? []
  const [selected, setSelected] = useState<Platform>(available[0]?.platform ?? "TikTok")
  const active = available.find((profile) => profile.platform === selected)
  const missing = platforms.filter((platform) => !available.some((profile) => profile.platform === platform))
  if (!available.length) return (
    <div className="space-y-5">
      <EmptyState title="No platform profiles yet" description="Approve the extracted requirements to generate a profile for every required platform, or add one by hand below." icon={<MonitorSmartphone className="size-6" />} />
      <Card className="mx-auto max-w-sm"><CardContent className="pt-6"><AddPlatformRow campaignId={campaign.id} missing={missing} onAdded={setSelected} /></CardContent></Card>
    </div>
  )
  return (
    <div className="space-y-5">
      <Alert><span className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" /><span>Campaign instructions override platform defaults. Saving a field marks it as your explicit override, and approving a later requirement revision leaves those overrides alone.</span></span></Alert>
      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="self-start"><CardHeader><CardTitle>Profiles</CardTitle><CardDescription>{available.filter((item) => item.enabled).length} enabled</CardDescription></CardHeader><CardContent className="space-y-1">{platforms.map((platform) => { const profile = available.find((item) => item.platform === platform); if (!profile) return null; return <button key={platform} onClick={() => setSelected(platform)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${selected === platform ? "bg-[var(--surface-accent-subtle)] font-semibold text-[var(--brand-text)]" : "text-[var(--fg-body)] hover:bg-[var(--surface-subtle)]"}`}><span className={`size-2 rounded-full ${profile.enabled ? "bg-brand" : "bg-[var(--surface-neutral-strong)]"}`} /><span className="flex-1">{labels[platform]}</span>{profile.origin === "Extracted" ? <Badge variant="default">Extracted</Badge> : profile.origin === "UserOverride" ? <Check className="size-4" /> : null}</button> })}<AddPlatformRow campaignId={campaign.id} missing={missing} onAdded={setSelected} /></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels[selected]}</CardTitle><CardDescription>Format, publishing copy, and safe-area rules.</CardDescription></CardHeader><CardContent>{active ? <ProfileEditor key={active.platform} campaignId={campaign.id} profile={active} /> : null}</CardContent></Card>
      </div>
    </div>
  )
}
