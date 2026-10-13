import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { RenderedClip } from "@/lib/types"
import { RenderedClipsCard } from "./rendered-clips-card"

vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://localhost:5000/api",
  getErrorMessage: (error: Error) => error.message,
  api: { renderedClips: vi.fn(), youtubeSchedule: vi.fn(), setClipCar: vi.fn(), job: vi.fn() },
}))

const clip = (plan: string, title: string, car: boolean): RenderedClip => ({
  relativePath: `out/${plan}.mp4`, fileName: `${plan}.mp4`, platform: "TikTok", sizeBytes: 123,
  createdAt: "2026-10-09T01:00:00Z", editPlanId: plan, title, car,
})
const clips = [clip("rolls", "TJR Takes His Rolls Through a Drive-Thru", true), clip("urus", "He Never Even Saw The Car", true),
  clip("ads", "TJR Only Spent $9 on Ads", false)]

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><RenderedClipsCard campaignId="campaign" /></QueryClientProvider>)
}

describe("cars only", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    window.localStorage.clear()
    vi.mocked(api.renderedClips).mockResolvedValue(clips)
    vi.mocked(api.youtubeSchedule).mockRejectedValue(new Error("not connected"))
  })

  it("hides every clip that is not a car clip, and shows them all again", async () => {
    mount()
    await screen.findByText("TJR Only Spent $9 on Ads")
    const cars = screen.getByRole("button", { name: "Cars only" })
    expect(cars.getAttribute("aria-pressed")).toBe("false")

    fireEvent.click(cars)
    expect(screen.queryByText("TJR Only Spent $9 on Ads")).toBeNull()
    expect(screen.getByText("TJR Takes His Rolls Through a Drive-Thru")).toBeTruthy()
    expect(screen.getByText("He Never Even Saw The Car")).toBeTruthy()
    expect(screen.getByText("2 of 3")).toBeTruthy()
    expect(cars.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(cars)
    expect(screen.getByText("TJR Only Spent $9 on Ads")).toBeTruthy()
  })

  it("remembers the switch for the campaign", async () => {
    window.localStorage.setItem("cars-only:campaign", "1")
    mount()
    await screen.findByText("He Never Even Saw The Car")
    expect(screen.queryByText("TJR Only Spent $9 on Ads")).toBeNull()
  })

  it("lets a clip the words got wrong be marked by hand", async () => {
    vi.mocked(api.setClipCar).mockResolvedValue({ car: true })
    mount()
    const mark = await screen.findByRole("button", { name: "Mark TJR Only Spent $9 on Ads as a car clip" })
    vi.mocked(api.renderedClips).mockResolvedValue(clips.map((item) => item.editPlanId === "ads" ? { ...item, car: true } : item))
    fireEvent.click(mark)
    await waitFor(() => expect(api.setClipCar).toHaveBeenCalledWith("ads", true))
    await screen.findByRole("button", { name: "Car clip: TJR Only Spent $9 on Ads. Mark as not a car clip" })
  })

  it("says so when no clip is a car clip", async () => {
    vi.mocked(api.renderedClips).mockResolvedValue([clip("ads", "TJR Only Spent $9 on Ads", false)])
    mount()
    await screen.findByText("TJR Only Spent $9 on Ads")
    fireEvent.click(screen.getByRole("button", { name: "Cars only" }))
    expect(screen.getByText("No car clips here")).toBeTruthy()
  })
})
