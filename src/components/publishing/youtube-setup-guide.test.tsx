import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PublishJob, YouTubeSchedule } from "@/lib/types"
import { YouTubeSetupGuide } from "./youtube-setup-guide"

const schedule = (overrides: Partial<YouTubeSchedule> = {}): YouTubeSchedule => ({
  settings: { slots: ["23:00", "02:00", "05:00", "08:00"], timeZoneId: "Singapore Standard Time", timeZoneName: "(UTC+08:00) Kuala Lumpur, Singapore" },
  notifications: { enabled: false, server: "https://ntfy.sh", topic: "whopclipper-abc123def456", subscribeUrl: "https://ntfy.sh/whopclipper-abc123def456" },
  connected: false, canManage: false, channel: null, message: "Save a Google Desktop OAuth client ID first.",
  nextFreeSlot: "2026-10-04T15:00:00Z", items: [], pages: [], ...overrides,
})

describe("the auto-upload setup steps", () => {
  afterEach(cleanup)

  it("says what is missing, lists every step, and opens Connections", () => {
    const open = vi.fn()
    const { container } = render(<YouTubeSetupGuide schedule={schedule()} onOpenConnections={open} />)

    expect(container.querySelector("details")!.open).toBe(true)
    expect(screen.getByText("Save a Google Desktop OAuth client ID first.")).toBeTruthy()
    expect(screen.getByText("Make a new project.")).toBeTruthy()
    expect(screen.getByText("YouTube Data API v3 page").getAttribute("href")).toBe("https://console.cloud.google.com/apis/library/youtube.googleapis.com")
    expect(screen.getByText(/The other lets it move or delete a scheduled clip/)).toBeTruthy()
    expect(screen.getByText(/4 times a day are set\./)).toBeTruthy()
    expect(screen.getByText(/After that this PC can be off\./)).toBeTruthy()
    // Only the daily times have a default, so only that step is done.
    expect(screen.getAllByLabelText("Done")).toHaveLength(1)
    expect(screen.getAllByLabelText("To do")).toHaveLength(3)

    fireEvent.click(screen.getByRole("button", { name: "Open Connections" }))
    expect(open).toHaveBeenCalledOnce()
  })

  it("ticks off what is done and folds away once YouTube is connected", () => {
    const { container } = render(<YouTubeSetupGuide schedule={schedule({
      connected: true, canManage: true, channel: "@clipnotes", message: "Ready.",
      notifications: { enabled: true, server: "https://ntfy.sh", topic: "whopclipper-abc123def456", subscribeUrl: "" },
      items: [{ id: "a" } as PublishJob],
    })} />)

    expect(container.querySelector("details")!.open).toBe(false)
    expect(screen.getByText("Setup is done. Show the steps")).toBeTruthy()
    expect(screen.getByText("@clipnotes")).toBeTruthy()
    expect(screen.getAllByLabelText("Done")).toHaveLength(4)
    expect(screen.queryByRole("button", { name: "Open Connections" })).toBeNull()
  })

  it("keeps asking to reconnect while the schedule cannot move or delete videos", () => {
    const { container } = render(<YouTubeSetupGuide schedule={schedule({
      connected: true, canManage: false, message: "Reconnect YouTube once: scheduling needs permission to move and delete videos, not just upload them.",
    })} />)

    expect(container.querySelector("details")!.open).toBe(true)
    expect(screen.getByText(/^Reconnect YouTube once: scheduling needs permission/)).toBeTruthy()
  })
})
