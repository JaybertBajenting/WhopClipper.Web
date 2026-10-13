import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { PublishJob, RenderedClip, YouTubeSchedule } from "@/lib/types"
import { RenderedClipsCard } from "./rendered-clips-card"

vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://localhost:5000/api",
  getErrorMessage: (error: Error) => error.message,
  api: { renderedClips: vi.fn(), youtubeSchedule: vi.fn(), setClipCar: vi.fn(), job: vi.fn() },
}))

const clip = (plan: string, title: string, car = true): RenderedClip => ({
  relativePath: `out/${plan}.mp4`, fileName: `${plan}.mp4`, platform: "TikTok", sizeBytes: 123,
  createdAt: "2026-10-12T01:00:00Z", editPlanId: plan, title, car,
})
const clips = [clip("public", "TJR's Bugatti Shocks A Stranger"), clip("slot", "TJR Tests If He Fits His Ferrari"),
  clip("free", "TJR Shows Off His $300K Brabus"), clip("ads", "TJR Only Spent $9 on Ads", false)]

const upload = (plan: string, status: string) => ({
  id: `yt-${plan}`, editPlanId: plan, outputRelativePath: `out/${plan}.mp4`, status,
  scheduledPublishAt: "2026-10-13T15:00:00Z", title: plan,
}) as unknown as PublishJob
const schedule = {
  settings: { slots: ["23:00"], timeZoneId: "Singapore Standard Time", timeZoneName: "(UTC+08:00) Kuala Lumpur, Singapore" },
  notifications: { enabled: false, server: "", topic: "", subscribeUrl: "" },
  connected: true, canManage: true, channel: "TJR Clips", message: "", nextFreeSlot: "2026-10-14T15:00:00Z", pages: [],
  items: [upload("public", "Published"), upload("slot", "Scheduled")],
} as unknown as YouTubeSchedule

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><RenderedClipsCard campaignId="campaign" /></QueryClientProvider>)
}

describe("the YouTube filter", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    window.localStorage.clear()
    vi.mocked(api.renderedClips).mockResolvedValue(clips)
    vi.mocked(api.youtubeSchedule).mockResolvedValue(schedule)
  })

  it("keeps the clips that are public or scheduled, then the ones that are not, then all of them", async () => {
    mount()
    const button = await screen.findByRole("button", { name: "On YouTube" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByText("TJR Shows Off His $300K Brabus")).toBeTruthy()

    fireEvent.click(button)
    expect(screen.getByText("TJR's Bugatti Shocks A Stranger")).toBeTruthy()
    expect(screen.getByText("TJR Tests If He Fits His Ferrari")).toBeTruthy()
    expect(screen.queryByText("TJR Shows Off His $300K Brabus")).toBeNull()
    expect(screen.getByText("2 of 4")).toBeTruthy()
    expect(button.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(button)
    expect(screen.getByRole("button", { name: "Not on YouTube" })).toBeTruthy()
    expect(screen.queryByText("TJR's Bugatti Shocks A Stranger")).toBeNull()
    expect(screen.getByText("TJR Shows Off His $300K Brabus")).toBeTruthy()
    expect(screen.getByText("TJR Only Spent $9 on Ads")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Not on YouTube" }))
    expect(screen.getByRole("button", { name: "On YouTube" }).getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByText("TJR's Bugatti Shocks A Stranger")).toBeTruthy()
  })

  it("works together with Cars only, and is remembered for the campaign", async () => {
    window.localStorage.setItem("youtube-filter:campaign", "off")
    mount()
    await screen.findByRole("button", { name: "Not on YouTube" })
    expect(screen.getByText("TJR Only Spent $9 on Ads")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cars only" }))
    expect(screen.queryByText("TJR Only Spent $9 on Ads")).toBeNull()
    expect(screen.getByText("TJR Shows Off His $300K Brabus")).toBeTruthy()
    expect(screen.getByText("1 of 4")).toBeTruthy()
  })

  it("is not offered while YouTube is not set up, and hides nothing then", async () => {
    window.localStorage.setItem("youtube-filter:campaign", "on")
    vi.mocked(api.youtubeSchedule).mockRejectedValue(new Error("not connected"))
    mount()
    await screen.findByText("TJR Shows Off His $300K Brabus")
    expect(screen.queryByRole("button", { name: "On YouTube" })).toBeNull()
    expect(screen.getByText("TJR's Bugatti Shocks A Stranger")).toBeTruthy()
  })
})
