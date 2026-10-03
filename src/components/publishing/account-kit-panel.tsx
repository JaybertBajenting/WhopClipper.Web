import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Clipboard, ExternalLink, Image, KeyRound, Save, ShieldCheck, UserRoundPlus, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { accountKitText, copyGeneratedPassword, copyText, publishingPlatformLabels, publishingPlatforms, safeAccountFields } from "@/lib/publishing"
import type { AccountKit, CampaignSummary, PlatformGuide, PublishingPlatform } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState } from "@/components/page"

function identityToken(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function KitEditor({ kit, guide, featuredSubject }: { kit: AccountKit; guide?: PlatformGuide; featuredSubject: string }) {
  const queryClient = useQueryClient()
  const fields = useMemo(() => safeAccountFields(kit.fields), [kit.fields])
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.key, field.value])))
  const [steps, setSteps] = useState<Record<number, boolean>>({})
  const save = useMutation({
    mutationFn: () => api.updateAccountKit(kit.campaignId, kit.platform, Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ""]))),
    onSuccess: () => {
      toast.success(`${kit.displayName} setup kit saved`)
      queryClient.invalidateQueries({ queryKey: ["publishing", "account-kits", kit.campaignId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const regenerate = useMutation({
    mutationFn: () => api.regenerateAccountKitIdentity(kit.campaignId, kit.platform),
    onSuccess: (updated) => {
      const updatedFields = safeAccountFields(updated.fields)
      setValues(Object.fromEntries(updatedFields.map((field) => [field.key, field.value])))
      queryClient.setQueryData<AccountKit[]>(["publishing", "account-kits", kit.campaignId], (current) =>
        current?.map((item) => item.platform === updated.platform ? updated : item))
      toast.success("Independent highlights identity regenerated. Signup and contact details were preserved.")
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const copyField = async (label: string, value: string) => {
    if (!value.trim()) return
    try { await copyText(value); toast.success(`${label} copied`) } catch { toast.error("Could not access the clipboard.") }
  }
  const copyAll = async () => {
    try {
      await copyText(accountKitText(kit.displayName, fields.map((field) => ({ ...field, value: values[field.key] ?? "" }))))
      toast.success("Copy-ready profile details copied")
    } catch { toast.error("Could not access the clipboard.") }
  }
  const generatePassword = async () => {
    try {
      await copyGeneratedPassword()
      toast.success("Strong password copied. Save it in your password manager now.", { duration: 8_000 })
    } catch (error) { toast.error(getErrorMessage(error)) }
  }
  const completedSteps = Object.values(steps).filter(Boolean).length
  const subjectToken = identityToken(featuredSubject)
  const identityMatchesSubject = Boolean(subjectToken) && ["displayName", "handle", "username"]
    .some((key) => identityToken(values[key] ?? "") === subjectToken)

  return (
    <div className="space-y-5">
      <Alert tone="info">
        <span><strong>Featured creator/brand:</strong> {featuredSubject}. <strong>Your account is separate:</strong> the suggestions below create an independent “Clip Notes” highlights identity with curated captions and context.</span>
      </Alert>
      {identityMatchesSubject && <Alert tone="warning"><strong>This identity still matches the featured creator.</strong> Use <em>Regenerate identity</em> or enter a distinct channel name and handle so viewers do not mistake it for the official account.</Alert>}
      <Alert tone="success">
        <span className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span><strong>No social account passwords are saved here.</strong> This kit contains only paste-ready signup and public profile details.</span></span>
      </Alert>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div><CardTitle>{kit.displayName} highlights-channel kit</CardTitle><CardDescription>These are editable identity suggestions for your channel—not credentials for impersonating the featured creator.</CardDescription></div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}><WandSparkles /> {regenerate.isPending ? "Regenerating…" : "Regenerate identity"}</Button>
            <Button variant="outline" size="sm" onClick={copyAll} disabled={!fields.some((field) => (values[field.key] ?? "").trim())}><Clipboard /> Copy all</Button>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map((field) => {
                const profileImage = /(?:profile|avatar).*(?:image|photo)|(?:image|photo).*(?:profile|avatar)/i.test(`${field.key} ${field.label}`)
                return (
                  <div key={field.key} className={profileImage ? "md:col-span-2" : undefined}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <Label htmlFor={`kit-${kit.platform}-${field.key}`}>{field.label}{field.required && <span className="text-[var(--danger-text)]" aria-label="required"> *</span>}</Label>
                      {field.copyable && <Button type="button" variant="ghost" size="sm" className="h-7 px-2" aria-label={`Copy ${field.label}`} disabled={!values[field.key]?.trim()} onClick={() => copyField(field.label, values[field.key] ?? "")}><Clipboard /> Copy</Button>}
                    </div>
                    <div className="relative">
                      {profileImage && <Image className="pointer-events-none absolute left-3 top-3 size-4 text-[var(--fg-subtle)]" />}
                      {field.key === "bio"
                        ? <Textarea id={`kit-${kit.platform}-${field.key}`} rows={4} value={values[field.key] ?? ""} required={field.required} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                        : <Input id={`kit-${kit.platform}-${field.key}`} className={profileImage ? "pl-9" : undefined} value={values[field.key] ?? ""} required={field.required} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} autoComplete="off" />}
                    </div>
                    {field.helpText && <p className="mt-1.5 text-xs leading-relaxed text-[var(--fg-muted)]">{field.helpText}</p>}
                  </div>
                )
              })}
            </div>

            <div className="rounded-2xl border border-[var(--border-accent)] bg-[var(--surface-accent-subtle)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-accent)] text-[var(--brand-text)]"><KeyRound className="size-5" /></span>
                <div className="flex-1"><p className="text-sm font-semibold">One-time password helper</p><p className="mt-1 text-xs leading-relaxed text-[var(--fg-body)]">Generates 24 random characters and copies them without displaying or saving the password. Paste it directly into signup and save it in your password manager.</p></div>
                <Button type="button" variant="outline" onClick={generatePassword}><KeyRound /> Generate & copy</Button>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" asChild><a href={kit.signupUrl} target="_blank" rel="noreferrer">Create {kit.displayName} account <ExternalLink /></a></Button>
              <Button variant="brand" type="submit" disabled={save.isPending}><Save /> {save.isPending ? "Saving…" : "Save account kit"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Account setup checklist</CardTitle><CardDescription>Session-only progress; nothing sensitive is persisted.</CardDescription></div><Badge variant={completedSteps === kit.setupSteps.length && kit.setupSteps.length ? "success" : "default"}>{completedSteps}/{kit.setupSteps.length}</Badge></CardHeader>
          <CardContent className="space-y-2">
            {kit.setupSteps.map((step, index) => <label key={`${index}-${step}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-default)] p-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand-strong)]" checked={steps[index] ?? false} onChange={(event) => setSteps((current) => ({ ...current, [index]: event.target.checked }))} /><span>{step}</span></label>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Platform requirements</CardTitle><CardDescription>{guide?.accountTypeRequirement || "Follow the platform’s current account requirements."}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <section><h4 className="text-xs font-bold uppercase tracking-wider text-[var(--fg-muted)]">Profile and access</h4><ul className="mt-2 space-y-2 text-sm text-[var(--fg-body)]">{(guide?.credentialRequirements ?? []).map((requirement) => <li key={requirement.key} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-dark" /><span><strong className="text-ink">{requirement.label}:</strong> {requirement.helpText}</span></li>)}</ul></section>
            <section><h4 className="text-xs font-bold uppercase tracking-wider text-[var(--fg-muted)]">Video basics</h4><ul className="mt-2 space-y-2 text-sm text-[var(--fg-body)]">{(guide?.videoRequirements ?? []).map((requirement) => <li key={requirement} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-dark" /><span>{requirement}</span></li>)}</ul></section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function AccountKitPanel({ campaigns, guides }: { campaigns: CampaignSummary[]; guides: PlatformGuide[] }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [platform, setPlatform] = useState<PublishingPlatform>("TikTok")
  const kits = useQuery({ queryKey: ["publishing", "account-kits", campaignId], queryFn: () => api.accountKits(campaignId), enabled: Boolean(campaignId), retry: 1 })
  if (!campaigns.length) return <EmptyState title="Create a campaign first" description="Account setup kits use the campaign brand, link, and publishing requirements to prepare paste-ready profile details." icon={<UserRoundPlus className="size-6" />} />
  const selected = kits.data?.find((kit) => kit.platform === platform)
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId)
  const featuredSubject = selectedCampaign?.brand?.trim() || selectedCampaign?.name || "Featured creator"
  return (
    <div className="space-y-5">
      <Card><CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><div><Label htmlFor="account-kit-campaign">Campaign</Label><Select value={campaignId} onValueChange={setCampaignId}><SelectTrigger id="account-kit-campaign" className="mt-1.5"><SelectValue placeholder="Select a campaign" /></SelectTrigger><SelectContent>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}{campaign.brand ? ` · ${campaign.brand}` : ""}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-wrap gap-2" role="group" aria-label="Platform account kit">{publishingPlatforms.map((item) => <Button key={item} type="button" variant={platform === item ? "brand" : "outline"} onClick={() => setPlatform(item)}>{publishingPlatformLabels[item]}</Button>)}</div></CardContent></Card>
      {kits.isLoading ? <Card><CardContent className="p-8 text-center text-sm text-[var(--fg-muted)]" aria-live="polite">Loading account kit…</CardContent></Card> : kits.isError ? <ErrorState title="Couldn’t load the account kit" message={getErrorMessage(kits.error)} onRetry={() => kits.refetch()} /> : selected ? <KitEditor key={`${campaignId}-${platform}`} kit={selected} guide={guides.find((guide) => guide.platform === platform)} featuredSubject={featuredSubject} /> : <EmptyState title={`${publishingPlatformLabels[platform]} kit unavailable`} description="The backend did not return a setup kit for this platform. Refresh or check the campaign requirements." />}
    </div>
  )
}
