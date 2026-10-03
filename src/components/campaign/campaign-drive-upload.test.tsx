import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { CampaignDriveUpload as Summary, Job } from "@/lib/types"
import { CampaignDriveReturn, CampaignDriveUpload, describeDriveMove, describeDriveReturn } from "./campaign-drive-upload"

vi.mock("@/lib/api", () => ({
  getErrorMessage: (error: Error) => error.message,
  api: { jobs: vi.fn(), driveUploadSummary: vi.fn(), uploadCampaignToDrive: vi.fn(), cancelJob: vi.fn(),
    driveReturnSummary: vi.fn(), bringCampaignBackFromDrive: vi.fn() },
}))

const summary: Summary = {
  remote: "gdrive:WhopClipper/Double Coverage Podcast Clips", sources: 6, sourceBytes: 178_000_000, clips: 47,
  clipBytes: 1_400_000_000, alreadyMoved: 0, stillWriting: 0,
}
const job = (overrides: Partial<Job> = {}): Job => ({
  id: "move", campaignId: "campaign", type: "DriveUpload", status: "Running", progress: 34,
  createdAt: "2026-10-02T00:00:00Z", ...overrides,
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><CampaignDriveUpload campaignId="campaign" /></QueryClientProvider>)
}

describe("moving a whole campaign to Google Drive", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.jobs).mockResolvedValue([])
    vi.mocked(api.driveUploadSummary).mockResolvedValue(summary)
  })

  it("says what will leave this PC before anything is sent, then starts one background move", async () => {
    vi.mocked(api.uploadCampaignToDrive).mockResolvedValue(job({ status: "Queued", progress: 0 }))
    mount()
    fireEvent.click(screen.getByRole("button", { name: "Move campaign to Drive" }))
    expect(await screen.findByText("47 finished clips")).toBeTruthy()
    expect(screen.getByText("6 source videos")).toBeTruthy()
    expect(screen.getByText(/then removed from this PC, freeing/)).toBeTruthy()
    expect(screen.getByText("1.5 GB")).toBeTruthy()
    expect(api.uploadCampaignToDrive).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Move to Drive" }))
    await waitFor(() => expect(api.uploadCampaignToDrive).toHaveBeenCalledWith("campaign"))
  })

  it("will not start a move of nothing", async () => {
    vi.mocked(api.driveUploadSummary).mockResolvedValue({ ...summary, clips: 0, clipBytes: 0, sources: 0, sourceBytes: 0 })
    mount()
    fireEvent.click(screen.getByRole("button", { name: "Move campaign to Drive" }))
    const button = await screen.findByRole("button", { name: "Nothing to move" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/None are on this PC/)).toBeTruthy()
  })

  it("shows a running move's progress and can stop it", async () => {
    vi.mocked(api.jobs).mockResolvedValue([job(), job({ id: "other", campaignId: "another campaign" })])
    vi.mocked(api.cancelJob).mockResolvedValue(job({ status: "Cancelled" }))
    mount()
    expect(await screen.findByText("Moving to Drive... 34%")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Move campaign to Drive" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    await waitFor(() => expect(api.cancelJob).toHaveBeenCalledWith("move"))
  })

  it("brings the whole campaign back after saying what comes back and the room it takes", async () => {
    vi.mocked(api.driveReturnSummary).mockResolvedValue({ clips: 47, clipBytes: 1_400_000_000, sources: 6, sourceBytes: 178_000_000, freeBytes: 60_000_000_000 })
    vi.mocked(api.bringCampaignBackFromDrive).mockResolvedValue(job({ id: "back", type: "DriveReturn", status: "Queued", progress: 0 }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><CampaignDriveReturn campaignId="campaign" /></QueryClientProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Bring back from Drive" }))
    expect(await screen.findByText("47 clips")).toBeTruthy()
    expect(screen.getByText("6 source videos")).toBeTruthy()
    expect(screen.getByText(/The copies in Google Drive stay/)).toBeTruthy()
    expect(api.bringCampaignBackFromDrive).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Bring back" }))
    await waitFor(() => expect(api.bringCampaignBackFromDrive).toHaveBeenCalledWith("campaign"))
  })

  it("will not bring back more than this PC has room for, or nothing at all", async () => {
    vi.mocked(api.driveReturnSummary).mockResolvedValue({ clips: 47, clipBytes: 1_400_000_000, sources: 0, sourceBytes: 0, freeBytes: 500_000_000 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><CampaignDriveReturn campaignId="campaign" /></QueryClientProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Bring back from Drive" }))
    expect(await screen.findByText(/not enough free space/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Bring back" }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    vi.mocked(api.driveReturnSummary).mockResolvedValue({ clips: 0, clipBytes: 0, sources: 0, sourceBytes: 0, freeBytes: 500_000_000 })
    render(<QueryClientProvider client={new QueryClient()}><CampaignDriveReturn campaignId="campaign" /></QueryClientProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Bring back from Drive" }))
    expect(((await screen.findByRole("button", { name: "Nothing to bring back" })) as HTMLButtonElement).disabled).toBe(true)
  })

  it("sums bringing back up in one line", () => {
    expect(describeDriveReturn(job({ resultJson: JSON.stringify({ clipsBack: 47, sourcesBack: 6, bytesFetched: 1_578_000_000 }) })))
      .toBe("Brought 47 clips and 6 source videos back from Google Drive (1.5 GB).")
  })

  it("sums a move up in one line, and says what stayed", () => {
    expect(describeDriveMove(job({ resultJson: JSON.stringify({ clipsMoved: 47, sourcesMoved: 6, bytesFreed: 1_578_000_000 }) })))
      .toBe("Moved 47 clips and 6 source videos to Google Drive, freeing 1.5 GB on this PC.")
    expect(describeDriveMove(job({ resultJson: JSON.stringify({ clipsMoved: 78, sourcesMoved: 0, bytesFreed: 1_400_000_000, keptForYouTube: 2 }) })))
      .toBe("Moved 78 clips to Google Drive, freeing 1.3 GB on this PC. 2 clips stayed: waiting to go up on YouTube or being re-rendered.")
    expect(describeDriveMove(job({ resultJson: JSON.stringify({ clipsMoved: 0, sourcesMoved: 0, bytesFreed: 0, keptRendering: 1 }) })))
      .toBe("Nothing was moved to Google Drive. 1 clip stayed: waiting to go up on YouTube or being re-rendered.")
  })
})
