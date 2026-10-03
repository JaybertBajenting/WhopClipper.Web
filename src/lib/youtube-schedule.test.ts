import { describe, expect, it } from "vitest"
import { readGoogleClientFile, scheduleFor, shortsUrl } from "@/lib/youtube-schedule"
import type { PublishJob, RenderedClip } from "@/lib/types"

const clip = {
  relativePath: String.raw`campaigns\c1\output\tiktok\clip-1.mp4`, fileName: "clip-1.mp4", platform: "tiktok", sizeBytes: 1,
  createdAt: "2026-09-26T00:00:00Z", editPlanId: "plan-1",
} as RenderedClip

const job = (status: PublishJob["status"], extra: Partial<PublishJob> = {}) => ({
  id: "job-1", campaignId: "c1", platform: "YouTubeShorts", status, progress: 0, outputRelativePath: "campaigns/c1/output/tiktok/clip-1.mp4",
  fileName: "clip-1.mp4", title: "t", caption: "", privacy: "private", shareToFeed: true, dryRun: false, fileSha256: "x",
  createdAt: "", updatedAt: "", scheduledPublishAt: "2026-09-26T15:00:00Z", ...extra,
}) as PublishJob

describe("YouTube schedule helpers", () => {
  it("finds a clip's live slot but not one that was taken off", () => {
    expect(scheduleFor(clip, [job("Scheduled", { editPlanId: "plan-1" })])?.id).toBe("job-1")
    expect(scheduleFor(clip, [job("Queued")])?.id).toBe("job-1")
    expect(scheduleFor(clip, [job("Removed", { editPlanId: "plan-1" })])).toBeUndefined()
  })

  it("links the Shorts page once the video exists", () => {
    expect(shortsUrl(job("Scheduled", { externalId: "abcDEF12345" }))).toBe("https://youtube.com/shorts/abcDEF12345")
    expect(shortsUrl(job("Queued"))).toBeNull()
  })

  it("reads a desktop Google client file and rejects anything else", () => {
    expect(readGoogleClientFile(JSON.stringify({ installed: { client_id: "id.apps.googleusercontent.com", client_secret: "s" } })))
      .toEqual({ clientId: "id.apps.googleusercontent.com", clientSecret: "s" })
    expect(() => readGoogleClientFile("{\"foo\":1}")).toThrow()
  })
})
