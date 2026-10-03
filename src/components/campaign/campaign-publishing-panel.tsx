import { useQuery } from "@tanstack/react-query"
import { Link2, Send, UserRoundPlus } from "lucide-react"
import { api, getErrorMessage } from "@/lib/api"
import type { CampaignDetail } from "@/lib/types"
import { AccountKitPanel } from "@/components/publishing/account-kit-panel"
import { ConnectionsPanel } from "@/components/publishing/connections-panel"
import { PublisherPanel } from "@/components/publishing/publisher-panel"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState } from "@/components/page"

export function CampaignPublishingPanel({ campaign }: { campaign: CampaignDetail }) {
  const guides = useQuery({ queryKey: ["publishing", "guides"], queryFn: api.publishingGuides, retry: 1, staleTime: 5 * 60_000 })
  if (guides.isLoading) return <Card><CardContent className="p-8 text-center text-sm text-[var(--fg-muted)]" aria-live="polite">Loading publishing tools…</CardContent></Card>
  if (guides.isError) return <ErrorState title="Publishing tools unavailable" message={getErrorMessage(guides.error)} onRetry={() => guides.refetch()} />
  return (
    <Tabs defaultValue="accounts">
      <div className="mb-5 overflow-x-auto pb-1"><TabsList className="min-w-max"><TabsTrigger value="accounts"><UserRoundPlus /> Account kit</TabsTrigger><TabsTrigger value="connections"><Link2 /> Connections</TabsTrigger><TabsTrigger value="upload"><Send /> Upload</TabsTrigger></TabsList></div>
      <TabsContent value="accounts"><AccountKitPanel campaigns={[campaign]} guides={guides.data ?? []} /></TabsContent>
      <TabsContent value="connections"><ConnectionsPanel guides={guides.data ?? []} /></TabsContent>
      <TabsContent value="upload"><PublisherPanel campaigns={[campaign]} guides={guides.data ?? []} /></TabsContent>
    </Tabs>
  )
}

