import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, CircleAlert, ExternalLink, FileJson, KeyRound, Link2, Plus, RefreshCw, Save, ShieldCheck, Unplug } from "lucide-react"
import { toast } from "sonner"
import { api, getErrorMessage } from "@/lib/api"
import { publishingPlatformLabels, publishingPlatforms } from "@/lib/publishing"
import { readGoogleClientFile } from "@/lib/youtube-schedule"
import type { PlatformGuide, PublishingConnectionInput, PublishingConnectionStatus, PublishingPlatform } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/page"
import { scheduleQueryKey } from "@/components/publishing/youtube-schedule-panel"
import { YouTubeConnectSteps } from "@/components/publishing/youtube-setup-guide"

const stateLabels = { NotConfigured: "Not configured", Configured: "Configured", NeedsAttention: "Needs attention" } as const

function ConnectionBadge({ connection }: { connection: PublishingConnectionStatus }) {
  return <Badge variant={connection.status === "Configured" ? "success" : connection.status === "NeedsAttention" ? "warning" : "default"}>{connection.status === "Configured" ? <CheckCircle2 /> : <CircleAlert />}{stateLabels[connection.status]}</Badge>
}

function ManualConnection({ guide, connection }: { guide?: PlatformGuide; connection: PublishingConnectionStatus }) {
  return (
    <div className="space-y-5">
      <Alert tone="warning"><span className="flex gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span><strong>TikTok stays manual in this personal tool.</strong> Whop Clipper prepares a ZIP and instructions, but it never stores TikTok login credentials or claims a post was uploaded.</span></span></Alert>
      <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>TikTok manual handoff</CardTitle><CardDescription>{guide?.accountTypeRequirement || "Use your own TikTok account in the official app or website."}</CardDescription></div><ConnectionBadge connection={connection} /></CardHeader><CardContent className="space-y-4"><ol className="space-y-3">{(guide?.uploadInstructions ?? []).map((instruction, index) => <li key={instruction} className="flex gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-accent)] text-xs font-bold text-[var(--brand-text)]">{index + 1}</span><span className="pt-0.5 text-[var(--fg-body)]">{instruction}</span></li>)}</ol><Button variant="outline" asChild><a href={guide?.signupUrl || "https://www.tiktok.com/signup"} target="_blank" rel="noreferrer">Open TikTok <ExternalLink /></a></Button></CardContent></Card>
    </div>
  )
}

function SecretStatus({ saved, label }: { saved: boolean; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-2.5 py-1 text-[11px] text-[var(--fg-body)]"><span className={`size-1.5 rounded-full ${saved ? "bg-brand-dark" : "bg-[var(--surface-neutral-strong)]"}`} />{label}: {saved ? "saved" : "not saved"}</span>
}

function ApiConnectionForm({ connection, guide, onOAuthStarted }: { connection: PublishingConnectionStatus; guide?: PlatformGuide; onOAuthStarted: () => void }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({ clientId: "", clientSecret: "", accessToken: "", refreshToken: "", accountId: connection.accountIdentifier ?? "", pageId: "", authMode: "FacebookLoginForBusiness", tokenExpiresAt: connection.tokenExpiresAt?.slice(0, 16) ?? "" })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["publishing", "connections"] })
  const save = useMutation({
    mutationFn: () => {
      const text = (key: string) => values[key]?.trim() || undefined
      const input: PublishingConnectionInput = {
        clientId: text("clientId"), clientSecret: text("clientSecret"), accessToken: text("accessToken"), refreshToken: text("refreshToken"),
        accountId: text("accountId"), pageId: text("pageId"), authMode: connection.platform === "InstagramReels" ? "FacebookLoginForBusiness" : undefined,
        tokenExpiresAt: text("tokenExpiresAt") ? new Date(values.tokenExpiresAt).toISOString() : undefined,
      }
      return api.updatePublishingConnection(connection.platform, input, connection.id)
    },
    onSuccess: () => { toast.success(`${publishingPlatformLabels[connection.platform]} configuration saved`); setValues((current) => ({ ...current, clientSecret: "", accessToken: "", refreshToken: "" })); invalidate() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const validate = useMutation({ mutationFn: () => api.validatePublishingConnection(connection.platform, connection.id), onSuccess: (result) => { toast[result.status === "Configured" ? "success" : "warning"](result.status === "Configured" ? "Connection validated" : result.lastError || "Connection needs attention"); invalidate() }, onError: (error) => toast.error(getErrorMessage(error)) })
  const disconnect = useMutation({ mutationFn: () => api.disconnectPublishingConnection(connection.platform, connection.id), onSuccess: () => { toast.success("Connection removed from this machine"); invalidate(); queryClient.invalidateQueries({ queryKey: scheduleQueryKey }) }, onError: (error) => toast.error(getErrorMessage(error)) })
  const oauth = useMutation({
    mutationFn: () => api.startYouTubeOAuth(connection.id),
    onSuccess: (result) => {
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer")
      toast.info("Finish signing in with Google in the browser. Status will refresh automatically.")
      onOAuthStarted()
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const isYouTube = connection.platform === "YouTubeShorts"
  const isInstagram = connection.platform === "InstagramReels"
  const canStartOAuth = connection.configuredFields.includes("clientId") && connection.configuredFields.includes("accountId")
  const update = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }))
  // The same Google client your Meme Shorts app already uses: its client_secret JSON fills both fields.
  // Read here in the browser; nothing is stored until Save configuration encrypts it.
  const importClientFile = async (file?: File) => {
    if (!file) return
    try {
      const { clientId, clientSecret } = readGoogleClientFile(await file.text())
      setValues((current) => ({ ...current, clientId, clientSecret }))
      toast.success("Client ID and secret filled in. Add the channel handle, then Save configuration.")
    } catch (error) { toast.error(getErrorMessage(error)) }
  }

  return (
    <div className="space-y-5">
      <Alert tone="success"><span className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>OAuth secrets and tokens are write-only, encrypted with Windows user protection, and never returned to this screen or written to app logs.</span></span></Alert>
      {isInstagram && <Alert tone="warning"><span className="flex gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span><strong>Local Reel upload requires Facebook Login for Business.</strong> The Instagram Professional account must be linked to a Facebook Page with an eligible content-publishing token. Direct Instagram Login alone cannot expose this local video to Meta.</span></span></Alert>}
      {isYouTube && (
        <Card>
          <CardHeader><CardTitle>How to connect YouTube</CardTitle><CardDescription>Do this once. After it, set the daily times under YouTube schedule.</CardDescription></CardHeader>
          <CardContent>
            <details open={connection.status !== "Configured"}>
              <summary className="cursor-pointer text-sm font-semibold">{connection.status === "Configured" ? "Connected. Show the steps" : "Steps"}</summary>
              <div className="mt-3"><YouTubeConnectSteps /></div>
            </details>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>{publishingPlatformLabels[connection.platform]} connection</CardTitle><CardDescription>{isYouTube ? "Configure a Google OAuth desktop app, then connect in your browser." : "Instagram publishing requires a Professional account, an account ID, and a content-publishing token."}</CardDescription></div><ConnectionBadge connection={connection} /></CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-wrap gap-2"><SecretStatus label="Client secret" saved={connection.secretConfigured.clientSecret} /><SecretStatus label="Access token" saved={connection.secretConfigured.accessToken} /><SecretStatus label="Refresh token" saved={connection.secretConfigured.refreshToken} /></div>
          {connection.accountIdentifier && <div className="mb-5 rounded-xl border border-[var(--border-accent)] bg-[var(--surface-accent-subtle)] p-4"><p className="text-xs font-semibold text-[var(--brand-text)]">Exact upload destination</p><p className="mt-1 font-mono text-sm text-ink">{connection.accountIdentifier}</p>{isYouTube ? <p className="mt-1 text-xs text-[var(--fg-body)]">{connection.channelTitle ? <>YouTube says this sign-in is the channel <strong>{connection.channelTitle}</strong>.</> : "The handle above is a label you typed. Click Connect YouTube once more to have YouTube confirm which channel this sign-in is."}</p> : null}{connection.lastValidatedAt && <p className="mt-1 text-xs text-[var(--fg-muted)]">Last validated {new Date(connection.lastValidatedAt).toLocaleString()}</p>}{connection.grantedScopes.length ? <p className="mt-1 text-xs text-[var(--fg-muted)]">Granted scope: {connection.grantedScopes.join(", ")}</p> : null}</div>}
          {connection.lastError && <Alert className="mb-5" tone="error">{connection.lastError}</Alert>}
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
            {isYouTube && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] p-3 text-xs text-[var(--fg-body)] hover:bg-[var(--surface-raised)]">
                <FileJson className="size-4 shrink-0" />
                <span><strong>Use a Google client file</strong> - pick the client_secret .json from Google Cloud (your Meme Shorts app keeps one in its secrets folder) to fill the client ID and secret.</span>
                <input type="file" accept=".json,application/json" className="sr-only" onChange={(event) => { void importClientFile(event.target.files?.[0]); event.target.value = "" }} />
              </label>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor={`${connection.platform}-client-id`}>OAuth client ID</Label><Input id={`${connection.platform}-client-id`} className="mt-1.5 font-mono text-xs" value={values.clientId} onChange={(event) => update("clientId", event.target.value)} placeholder={connection.configuredFields.includes("clientId") ? "Saved — enter only to replace" : "Paste client ID"} autoComplete="off" /></div>
              <div><Label htmlFor={`${connection.platform}-client-secret`}>OAuth client secret {isYouTube && <span className="font-normal text-[var(--fg-muted)]">(optional for desktop apps)</span>}</Label><Input id={`${connection.platform}-client-secret`} className="mt-1.5 font-mono text-xs" type="password" value={values.clientSecret} onChange={(event) => update("clientSecret", event.target.value)} placeholder={connection.secretConfigured.clientSecret ? "Saved securely — enter only to replace" : isYouTube ? "Optional if Google did not issue one" : "Paste client secret"} autoComplete="new-password" /></div>
              <div><Label htmlFor={`${connection.platform}-account-id`}>{isYouTube ? "Exact channel handle or ID" : "Instagram professional account ID"}</Label><Input id={`${connection.platform}-account-id`} className="mt-1.5 font-mono text-xs" value={values.accountId} onChange={(event) => update("accountId", event.target.value)} placeholder={isYouTube ? "Required, e.g. @channel or UC…" : "Required IG account ID"} autoComplete="off" /></div>
              <div><Label htmlFor={`${connection.platform}-token-expiry`}>Token expiry</Label><Input id={`${connection.platform}-token-expiry`} className="mt-1.5" type="datetime-local" value={values.tokenExpiresAt} onChange={(event) => update("tokenExpiresAt", event.target.value)} /></div>
              {isInstagram && <><div><Label htmlFor="InstagramReels-page-id">Linked Facebook Page ID</Label><Input id="InstagramReels-page-id" className="mt-1.5 font-mono text-xs" value={values.pageId} onChange={(event) => update("pageId", event.target.value)} placeholder={connection.configuredFields.includes("pageId") ? "Saved — enter only to replace" : "Required for local Reel upload"} autoComplete="off" /></div><div><Label>Authentication mode</Label><Select value={values.authMode} onValueChange={(value) => update("authMode", value)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FacebookLoginForBusiness">Facebook Login for Business</SelectItem></SelectContent></Select></div></>}
            </div>
            <details className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4"><summary className="cursor-pointer text-sm font-semibold">Advanced token setup</summary><p className="mt-2 text-xs leading-relaxed text-[var(--fg-muted)]">Use only if you already completed the provider’s OAuth flow elsewhere. Leave saved secrets blank to keep them unchanged.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label htmlFor={`${connection.platform}-access-token`}>Access token</Label><Input id={`${connection.platform}-access-token`} className="mt-1.5 font-mono text-xs" type="password" value={values.accessToken} onChange={(event) => update("accessToken", event.target.value)} placeholder={connection.secretConfigured.accessToken ? "Saved securely — enter only to replace" : "Paste access token"} autoComplete="new-password" /></div><div><Label htmlFor={`${connection.platform}-refresh-token`}>Refresh token</Label><Input id={`${connection.platform}-refresh-token`} className="mt-1.5 font-mono text-xs" type="password" value={values.refreshToken} onChange={(event) => update("refreshToken", event.target.value)} placeholder={connection.secretConfigured.refreshToken ? "Saved securely — enter only to replace" : "Paste refresh token"} autoComplete="new-password" /></div></div></details>
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending || connection.status === "NotConfigured"}><Unplug /> Disconnect</Button><Button type="button" variant="outline" onClick={() => validate.mutate()} disabled={validate.isPending || connection.status === "NotConfigured"}><RefreshCw className={validate.isPending ? "animate-spin" : undefined} /> Validate</Button><Button type="submit" variant="brand" disabled={save.isPending}><Save /> {save.isPending ? "Saving…" : "Save configuration"}</Button></div>
          </form>
        </CardContent>
      </Card>
      <Alert tone={connection.canPublish ? "success" : "warning"}><strong>{connection.canPublish ? "Automatic upload ready." : "Automatic upload unavailable."}</strong> {connection.capabilityMessage}</Alert>
      {isYouTube && <Card className="border-[var(--border-accent)]"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-accent)] text-[var(--brand-text)]"><Link2 className="size-5" /></span><div className="flex-1"><p className="text-sm font-semibold">Connect with Google OAuth</p><p className="mt-1 text-xs leading-relaxed text-[var(--fg-body)]">Save your client ID and exact destination channel first; a client secret is optional for Google desktop apps. Google opens in your system browser, then Whop Clipper receives the loopback callback and encrypts the resulting tokens.</p></div><Button variant="brand" onClick={() => oauth.mutate()} disabled={!canStartOAuth || oauth.isPending}><KeyRound /> {oauth.isPending ? "Starting…" : "Connect YouTube"}</Button></CardContent></Card>}
      {guide?.limitations.length ? <Card><CardHeader><CardTitle>Before you connect</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-[var(--fg-body)]">{guide.limitations.map((item) => <li key={item} className="flex gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning-text)]" />{item}</li>)}</ul></CardContent></Card> : null}
    </div>
  )
}

const statusDot = (status: PublishingConnectionStatus["status"]) =>
  status === "Configured" ? "bg-[var(--brand-strong)]" : status === "NeedsAttention" ? "bg-[var(--warning-solid)]" : "bg-[var(--surface-neutral-strong)]"

/**
 * The connected YouTube pages, and the way to add another. Each page is its own sign-in to one channel,
 * and each campaign picks the page it posts to.
 */
export function YouTubePages({ pages, selectedId, onSelect }: {
  pages: PublishingConnectionStatus[]; selectedId?: string | null; onSelect: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [handle, setHandle] = useState("")
  const add = useMutation({
    mutationFn: () => api.addYouTubePage(handle.trim()),
    onSuccess: (page) => {
      toast.success("Page added. Now click Connect YouTube below and pick that channel on Google's screen.")
      setHandle("")
      queryClient.invalidateQueries({ queryKey: ["publishing", "connections"] })
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey })
      if (page.id) onSelect(page.id)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>YouTube pages</CardTitle>
        <CardDescription>Each page is its own sign-in to one channel, with its own daily times. Each campaign picks the page it posts to, under Review &amp; export.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="YouTube page">
          {pages.map((page) => (
            <Button key={page.id} size="sm" variant={page.id === selectedId ? "brand" : "outline"} aria-pressed={page.id === selectedId} onClick={() => onSelect(page.id!)}>
              {page.accountIdentifier || "Unnamed page"}{page.channelTitle ? ` (${page.channelTitle})` : ""}
              <span className={`size-2 rounded-full ${statusDot(page.status)}`} />
            </Button>
          ))}
        </div>
        <form className="space-y-2 rounded-xl border border-dashed border-[var(--border-strong)] p-3" onSubmit={(event) => { event.preventDefault(); add.mutate() }}>
          <Label htmlFor="new-youtube-page">Add another page</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="new-youtube-page" className="max-w-xs font-mono text-xs" value={handle} onChange={(event) => setHandle(event.target.value)}
              placeholder="The new channel's handle, e.g. @secondchannel" autoComplete="off" />
            <Button type="submit" variant="outline" size="sm" disabled={!handle.trim() || add.isPending}><Plus /> {add.isPending ? "Adding..." : "Add page"}</Button>
          </div>
          <p className="text-[11px] text-[var(--fg-muted)]">
            The new page uses the same Google client file, so there is nothing to do in Google Cloud. After adding it, click <strong>Connect YouTube</strong> and pick the new channel on Google's screen. If you pick a channel that is already connected, the app refuses it and tells you.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export function ConnectionsPanel({ guides }: { guides: PlatformGuide[] }) {
  const [platform, setPlatform] = useState<PublishingPlatform>("YouTubeShorts")
  const [pageId, setPageId] = useState<string | null>(null)
  const [pollUntil, setPollUntil] = useState(0)
  const connections = useQuery({ queryKey: ["publishing", "connections"], queryFn: api.publishingConnections, retry: 1, refetchInterval: (query) => {
    // After Connect YouTube, watch the page that is signing in until it turns up connected.
    const pages = query.state.data?.filter((connection) => connection.platform === "YouTubeShorts") ?? []
    const youtubeReady = (pages.find((page) => page.id === pageId) ?? pages[0])?.status === "Configured"
    return pollUntil > Date.now() && !youtubeReady ? 2_000 : false
  } })
  // YouTube can have several pages; the other platforms have one connection each.
  const pages = connections.data?.filter((connection) => connection.platform === "YouTubeShorts" && connection.id) ?? []
  const selected = platform === "YouTubeShorts" && pages.length
    ? pages.find((page) => page.id === pageId) ?? pages[0]
    : connections.data?.find((connection) => connection.platform === platform)

  if (connections.isError) return <ErrorState title="Couldn’t load connections" message={getErrorMessage(connections.error)} onRetry={() => connections.refetch()} />
  return (
    <div className="space-y-5">
      <Card><CardContent className="flex flex-wrap gap-2 p-5" role="group" aria-label="Publishing connection">{publishingPlatforms.map((item) => { const status = connections.data?.find((connection) => connection.platform === item); return <Button key={item} variant={platform === item ? "brand" : "outline"} onClick={() => setPlatform(item)}>{publishingPlatformLabels[item]}{status && <span className={`size-2 rounded-full ${statusDot(status.status)}`} />}</Button> })}</CardContent></Card>
      {platform === "YouTubeShorts" && pages.length ? <YouTubePages pages={pages} selectedId={selected?.id} onSelect={setPageId} /> : null}
      {connections.isLoading || !selected ? <Card><CardContent className="p-8 text-center text-sm text-[var(--fg-muted)]" aria-live="polite">Loading connection status…</CardContent></Card> : selected.connectionMode === "Manual" ? <ManualConnection connection={selected} guide={guides.find((guide) => guide.platform === platform)} /> : <ApiConnectionForm key={`${platform}-${selected.id ?? "new"}-${selected.updatedAt ?? "new"}`} connection={selected} guide={guides.find((guide) => guide.platform === platform)} onOAuthStarted={() => setPollUntil(Date.now() + 120_000)} />}
    </div>
  )
}
