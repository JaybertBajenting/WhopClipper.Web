import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { Job, RenderedClip, YouTubeSchedule } from "@/lib/types"
import { ClipDetail } from "./rendered-clips-card"

vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://localhost:5000/api",
  getErrorMessage: (error: Error) => error.message,
  api: { clipPreview: vi.fn(), mediaAssets: vi.fn(), rerenderClip: vi.fn(), startBrollRepair: vi.fn(),
    brollRepairCandidate: vi.fn(), applyBrollRepair: vi.fn(), deleteOutput: vi.fn(), moveToDrive: vi.fn(),
    bringBackFromDrive: vi.fn() },
}))

const preview = {
  campaignId: "campaign", previewRelativePath: "out/voice-only.preview.mp4", musicAssetId: "song",
  musicStartSeconds: 131, voiceVolume: 1, musicVolume: 0.2, musicNeedsRender: false,
}
const clip: RenderedClip = {
  relativePath: "out/final.mp4", fileName: "final.mp4", platform: "TikTok", sizeBytes: 123,
  createdAt: "2026-09-22T01:00:00Z", editPlanId: "plan", title: "Test clip",
  style: { style: "PodcastSplit", pieces: 1, cameraShots: 1, brollShots: 1, gaps: [], footage: [], voiceVolume: 1, musicVolume: 0.2 },
}

function mount(video: RenderedClip = clip, repairJob?: Job, onRepair = vi.fn(), onRepairApplied = vi.fn(),
  { schedule, onClose = vi.fn() }: { schedule?: YouTubeSchedule; onClose?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>
    <ClipDetail campaignId="campaign" clip={video} defaultVoice={1} defaultMusic={0.2}
      repairJob={repairJob} onRepair={onRepair} onRepairApplied={onRepairApplied} schedule={schedule}
      onRerender={vi.fn()} onClose={onClose} />
  </QueryClientProvider>)
}

describe("rendered clip review and saving", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.clipPreview).mockResolvedValue(preview)
    vi.mocked(api.mediaAssets).mockResolvedValue([])
  })

  it("plays the exact downloadable mix, with no separate song to drift after pause or seek", async () => {
    const { container } = mount()
    const download = await screen.findByRole("link", { name: "Save a copy" })
    const video = container.querySelector("video")!
    expect(video.src).toBe(download.getAttribute("href"))
    expect(video.src).toContain("%2Ffinal.mp4")
    expect(video.src).toContain("&v=")
    expect(container.querySelector("audio")).toBeNull()
    fireEvent.play(video)
    fireEvent.pause(video)
    video.currentTime = 17
    fireEvent.seeked(video)
    fireEvent.play(video)
    expect(video.currentTime).toBe(17)
    expect(video.src).toBe(download.getAttribute("href"))
  })

  it("blocks saving after a level edit and after a failed render", async () => {
    vi.mocked(api.rerenderClip).mockRejectedValue(new Error("Render unavailable"))
    mount()
    await screen.findByRole("link", { name: "Save a copy" })
    fireEvent.change(screen.getByRole("slider", { name: /Music/ }), { target: { value: "35" } })
    expect(screen.getByRole("button", { name: "Save a copy" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Re-render with these changes" }))
    await waitFor(() => expect(api.rerenderClip).toHaveBeenCalledWith("plan", { voiceVolume: 1, musicVolume: 0.35 }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Re-render with these changes" })).toBeEnabled())
    expect(screen.getByRole("button", { name: "Save a copy" })).toBeDisabled()
  })

  it("blocks a song changed in an earlier session until the render completes", async () => {
    vi.mocked(api.clipPreview).mockResolvedValue({ ...preview, musicNeedsRender: true })
    mount()
    await screen.findByRole("button", { name: "Re-render with these changes" })
    expect(screen.getByRole("button", { name: "Save a copy" })).toBeDisabled()
    expect(screen.queryByRole("link", { name: "Save a copy" })).toBeNull()
  })

  it("changes the shared review/download URL when the output file changes", async () => {
    const first = mount()
    const before = (await screen.findByRole("link", { name: "Save a copy" })).getAttribute("href")
    first.unmount()
    mount({ ...clip, createdAt: "2026-09-22T02:00:00Z", sizeBytes: 124 })
    const after = (await screen.findByRole("link", { name: "Save a copy" })).getAttribute("href")
    expect(after).not.toBe(before)
  })

  it("marks seconds and queues footage repair without changing the current player", async () => {
    vi.mocked(api.startBrollRepair).mockResolvedValue({ id: "repair-job", status: "Queued" } as Job)
    const onRepair = vi.fn()
    const { container } = mount({ ...clip, startSeconds: 100, endSeconds: 120 }, undefined, onRepair)
    const current = container.querySelector("video")!.src
    fireEvent.change(screen.getByRole("spinbutton", { name: "B-roll repair start" }), { target: { value: "4" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: "B-roll repair end" }), { target: { value: "7" } })
    fireEvent.change(screen.getByRole("textbox", { name: "B-roll repair note" }), { target: { value: "Wrong fighter" } })
    fireEvent.click(screen.getByRole("button", { name: "Find replacement B-roll" }))
    await waitFor(() => expect(api.startBrollRepair).toHaveBeenCalledWith("plan", {
      startSeconds: 4, endSeconds: 7, note: "Wrong fighter",
    }))
    await waitFor(() => expect(onRepair).toHaveBeenCalledWith("plan", "repair-job"))
    expect(container.querySelector("video")!.src).toBe(current)
  })

  it("requires a candidate preview and explicit apply before replacing the clip", async () => {
    vi.mocked(api.brollRepairCandidate).mockResolvedValue({
      repairId: "repair-job", planId: "plan", startSeconds: 4, endSeconds: 7,
      spokenText: "Gaethje walked out", createdAt: "2026-09-23T00:00:00Z",
      shots: [{ query: "Justin Gaethje walkout", sourceTitle: "Actual event", sourceUrl: "https://youtube.com/watch?v=test", durationSeconds: 3 }],
      previewUrl: "/api/edit-plans/plan/broll-repairs/repair-job/file",
    })
    vi.mocked(api.applyBrollRepair).mockResolvedValue({ applied: true, archivedRelativePath: "archive", outputRelativePath: "out/final.mp4" })
    const onApplied = vi.fn()
    mount({ ...clip, startSeconds: 100, endSeconds: 120 }, { id: "repair-job", status: "Completed" } as Job, vi.fn(), onApplied)
    expect(await screen.findByText("Preview replacement before applying")).toBeInTheDocument()
    expect(api.applyBrollRepair).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Apply this B-roll repair" }))
    await waitFor(() => expect(api.applyBrollRepair).toHaveBeenCalledWith("plan", "repair-job"))
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith("plan"))
  })

  it("deletes a clip only on the second click, then closes it", async () => {
    vi.mocked(api.deleteOutput).mockResolvedValue(undefined)
    const onClose = vi.fn()
    mount(clip, undefined, vi.fn(), vi.fn(), { onClose })
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }))
    expect(api.deleteOutput).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    fireEvent.click(screen.getByRole("button", { name: /Confirm: Delete Test clip/ }))
    await waitFor(() => expect(api.deleteOutput).toHaveBeenCalledWith("campaign", "out/final.mp4"))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("will not delete a clip that is still waiting to go up on YouTube", async () => {
    const schedule = {
      connected: true, canManage: true, message: "", nextFreeSlot: "2026-09-28T15:00:00Z",
      items: [{ id: "yt", editPlanId: "plan", outputRelativePath: "out/final.mp4", status: "Scheduled",
        scheduledPublishAt: "2026-09-28T15:00:00Z", title: "Test clip" }],
    } as unknown as YouTubeSchedule
    mount(clip, undefined, vi.fn(), vi.fn(), { schedule })
    const button = await screen.findByRole("button", { name: "Delete" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("title", "On the YouTube schedule. Take it off YouTube first.")
    const move = screen.getByRole("button", { name: "Move to Google Drive" })
    expect(move).toBeDisabled()
    expect(move).toHaveAttribute("title", "On the YouTube schedule. Move it once it has gone up.")
  })

  it("moves a clip to Google Drive only after it is confirmed", async () => {
    vi.mocked(api.moveToDrive).mockResolvedValue({ remote: "gdrive:WhopClipper/Campaign", movedAt: "2026-09-29T00:00:00Z", bytes: 123 })
    mount()
    fireEvent.click(await screen.findByRole("button", { name: "Move to Google Drive" }))
    expect(api.moveToDrive).not.toHaveBeenCalled()
    expect(screen.getByText(/checks every file there, then frees/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Confirm: Move Test clip to Google Drive/ }))
    await waitFor(() => expect(api.moveToDrive).toHaveBeenCalledWith("campaign", "out/final.mp4"))
  })

  it("shows a moved clip by its thumbnail and brings it back in one click", async () => {
    vi.mocked(api.bringBackFromDrive).mockResolvedValue(undefined)
    const moved: RenderedClip = { ...clip, drive: { remote: "gdrive:WhopClipper/Campaign", movedAt: "2026-09-29T00:00:00Z", bytes: 123 } }
    const { container } = mount(moved)
    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector("img")!.getAttribute("src")).toContain("/outputs/poster?path=out%2Ffinal.mp4")
    expect(screen.queryByRole("button", { name: /Re-render/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
    fireEvent.click(await screen.findByRole("button", { name: "Bring back from Google Drive" }))
    await waitFor(() => expect(api.bringBackFromDrive).toHaveBeenCalledWith("campaign", "out/final.mp4"))
  })
})
