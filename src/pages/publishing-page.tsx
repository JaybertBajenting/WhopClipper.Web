import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Link2, Send, ShieldCheck, UserRoundPlus } from "lucide-react"
import { api, getErrorMessage } from "@/lib/api"
import { AccountKitPanel } from "@/components/publishing/account-kit-panel"
import { ConnectionsPanel } from "@/components/publishing/connections-panel"
import { PublisherPanel } from "@/components/publishing/publisher-panel"
import { YouTubeSchedulePanel } from "@/components/publishing/youtube-schedule-panel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState, LoadingPage, PageHeader } from "@/components/page"

export function PublishingPage() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.campaigns(false), retry: 1 })
  const guides = useQuery({ queryKey: ["publishing", "guides"], queryFn: api.publishingGuides, retry: 1, staleTime: 5 * 60_000 })
  if (campaigns.isLoading || guides.isLoading) return <LoadingPage cards={3} />
  if (campaigns.isError || guides.isError) return <ErrorState title="Publishing workspace unavailable" message={getErrorMessage(campaigns.error || guides.error)} onRetry={() => { campaigns.refetch(); guides.refetch() }} />
  return (
    <div className="animate-enter">
      <PageHeader eyebrow="Account-to-upload workflow" title="Publishing" description="Prepare campaign-specific account details, connect supported APIs securely, and send approved renders with an explicit final review." />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-[var(--surface-accent)] text-[var(--brand-text)]"><UserRoundPlus className="size-5" /></span><div><p className="text-sm font-semibold">Paste-ready setup kits</p><p className="mt-0.5 text-xs text-[var(--fg-muted)]">No account passwords stored</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-[var(--surface-info)] text-[var(--info-text)]"><ShieldCheck className="size-5" /></span><div><p className="text-sm font-semibold">Encrypted local connections</p><p className="mt-0.5 text-xs text-[var(--fg-muted)]">Write-only OAuth secrets</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-[var(--surface-warning)] text-[var(--warning-text)]"><Send className="size-5" /></span><div><p className="text-sm font-semibold">Review before every post</p><p className="mt-0.5 text-xs text-[var(--fg-muted)]">TikTok remains manual</p></div></CardContent></Card>
      </div>
      <Tabs defaultValue="accounts">
        <div className="mb-5 overflow-x-auto pb-1"><TabsList className="min-w-max"><TabsTrigger value="accounts"><UserRoundPlus /> Account setup <Badge variant="default">Per campaign</Badge></TabsTrigger><TabsTrigger value="connections"><Link2 /> Connections</TabsTrigger><TabsTrigger value="publish"><Send /> Upload videos</TabsTrigger><TabsTrigger value="schedule"><CalendarClock /> YouTube schedule</TabsTrigger></TabsList></div>
        <TabsContent value="accounts"><AccountKitPanel campaigns={campaigns.data ?? []} guides={guides.data ?? []} /></TabsContent>
        <TabsContent value="connections"><ConnectionsPanel guides={guides.data ?? []} /></TabsContent>
        <TabsContent value="publish"><PublisherPanel campaigns={campaigns.data ?? []} guides={guides.data ?? []} /></TabsContent>
        <TabsContent value="schedule"><YouTubeSchedulePanel /></TabsContent>
      </Tabs>
    </div>
  )
}

