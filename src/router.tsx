import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router"
import { AppShell } from "@/components/app-shell"
import { AudioLibraryPage } from "@/pages/audio-library-page"
import { CampaignsPage } from "@/pages/campaigns-page"
import { CampaignWorkspacePage } from "@/pages/campaign-workspace-page"
import { DashboardPage } from "@/pages/dashboard-page"
import { JobsPage } from "@/pages/jobs-page"
import { SettingsPage } from "@/pages/settings-page"
import { Button } from "@/components/ui/button"

function RootLayout() {
  return <AppShell><Outlet /></AppShell>
}

function NotFoundPage() {
  return <div className="flex min-h-[65vh] flex-col items-center justify-center text-center"><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-dark">404</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">This workspace view doesn’t exist</h1><p className="mt-2 text-sm text-[var(--fg-muted)]">The link may be old, or the campaign may have been archived.</p><Button className="mt-6" onClick={() => router.navigate({ to: "/" })}>Back to dashboard</Button></div>
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage })
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage })
const campaignsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/campaigns", component: CampaignsPage })
const campaignRoute = createRoute({ getParentRoute: () => rootRoute, path: "/campaigns/$campaignId", component: () => { const { campaignId } = campaignRoute.useParams(); return <CampaignWorkspacePage campaignId={campaignId} /> } })
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/library", component: AudioLibraryPage })
const jobsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/jobs", component: JobsPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage })

const routeTree = rootRoute.addChildren([dashboardRoute, campaignsRoute, campaignRoute, libraryRoute, jobsRoute, settingsRoute])

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true })

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
