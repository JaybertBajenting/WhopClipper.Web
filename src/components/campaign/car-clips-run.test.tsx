import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { CampaignDetail, EditPlan } from "@/lib/types"
import { SourcesPanel } from "./sources-panel"

vi.mock("@/lib/api", () => ({
  getErrorMessage: (error: Error) => error.message,
  api: { startSourcePipeline: vi.fn(), downloadSource: vi.fn(), deleteSource: vi.fn(), inspectSource: vi.fn(), autoRunCampaign: vi.fn() },
}))
vi.mock("@/components/campaign/detected-links-card", () => ({ DetectedLinksCard: () => null }))
vi.mock("@/components/campaign/local-sources-card", () => ({ LocalSourcesCard: () => null }))

const campaign = (style: string | null, clipped = true) => ({
  id: "campaign",
  editStyle: style ? { style } : null,
  sources: [
    // Queued by its link and never inspected: no length on record, so isVideo is false, yet it has clips.
    { id: "rolls", title: "Vintage Rolls Royce in Puerto Rico", url: "https://www.youtube.com/watch?v=Em_Yyx_sEDs", isVideo: false, durationSeconds: null },
    { id: "channel", title: "His channel", url: "https://www.youtube.com/@tjr", isVideo: false },
  ],
  editPlans: clipped ? [{ id: "plan", sourceAssetId: "rolls" } as EditPlan] : [],
}) as unknown as CampaignDetail

function mount(detail: CampaignDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><SourcesPanel campaign={detail} /></QueryClientProvider>)
}

describe("car clips run", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.startSourcePipeline).mockResolvedValue([])
  })

  it("runs a video again for car clips even though it already has clips", async () => {
    mount(campaign("NarratedLuxury"))
    // The ordinary run is blocked for a source that has clips; the car pass is a second look at it.
    expect((screen.getAllByRole("button", { name: "Process this source" })[0] as HTMLButtonElement).disabled).toBe(true)
    // One button for the video; none for the channel link, which is not a video.
    const cars = screen.getAllByRole("button", { name: "Car clips" })
    expect(cars).toHaveLength(1)

    fireEvent.click(cars[0])
    await waitFor(() => expect(api.startSourcePipeline).toHaveBeenCalledWith("campaign", "rolls", "cars"))
  })

  it("is only offered for the narrated style", () => {
    mount(campaign("PodcastSplit"))
    expect(screen.queryByRole("button", { name: "Car clips" })).toBeNull()
    cleanup()
    mount(campaign(null))
    expect(screen.queryByRole("button", { name: "Car clips" })).toBeNull()
  })
})
