import { beforeEach, describe, expect, it, vi } from "vitest"
import { api, http, manualPublishingPackageUrl } from "@/lib/api"
import type { AccountKit, PublishJob, PublishingConnectionStatus } from "@/lib/types"

const connection: PublishingConnectionStatus = {
  platform: "YouTubeShorts", connectionMode: "Api", status: "Configured", configuredFields: ["clientId"],
  secretConfigured: { clientSecret: true, accessToken: true, refreshToken: true }, accountIdentifier: "channel-1",
  grantedScopes: ["https://www.googleapis.com/auth/youtube.upload"],
  canPublish: true, capabilityMessage: "Ready to publish.",
}

const job: PublishJob = {
  id: "job-1", campaignId: "campaign-1", platform: "YouTubeShorts", status: "Queued", progress: 0,
  outputRelativePath: "outputs/clip.mp4", fileName: "clip.mp4", title: "Title", caption: "Caption", privacy: "private",
  shareToFeed: false, dryRun: false, accountIdentifier: "channel-1", fileSha256: "abc123",
  createdAt: "2026-08-29T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z",
}

describe("publishing API bindings", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("adds the per-launch nonce to account-kit writes and sends only the fields envelope", async () => {
    vi.spyOn(http, "get").mockResolvedValue({ data: { nonce: "nonce-123", headerName: "X-WhopClipper-Nonce" } })
    const kit = { campaignId: "campaign-1", platform: "TikTok", displayName: "TikTok", connectionMode: "Manual", signupUrl: "https://example.test", fields: [], setupSteps: [], publishDefaults: { enabled: true, title: "Title", caption: "Caption", hashtags: [], mentions: [], privacy: "private" } } satisfies AccountKit
    const put = vi.spyOn(http, "put").mockResolvedValue({ data: kit })
    await api.updateAccountKit("campaign-1", "TikTok", { username: "dailyclips" })
    expect(put).toHaveBeenCalledWith("/campaigns/campaign-1/publishing/account-kits/TikTok", { fields: { username: "dailyclips" } }, { headers: { "X-WhopClipper-Nonce": "nonce-123" } })
  })

  it("maps write-only connection configuration without expecting returned secrets", async () => {
    const put = vi.spyOn(http, "put").mockResolvedValue({ data: connection })
    const result = await api.updatePublishingConnection("YouTubeShorts", { clientId: "client", clientSecret: "write-only" })
    expect(put).toHaveBeenCalledWith("/publishing/connections/YouTubeShorts", { clientId: "client", clientSecret: "write-only" }, { headers: { "X-WhopClipper-Nonce": "nonce-123" } })
    expect(result.secretConfigured.clientSecret).toBe(true)
    expect(result).not.toHaveProperty("clientSecret")
  })

  it("sends explicit confirmation and idempotency metadata for publishing", async () => {
    const post = vi.spyOn(http, "post").mockResolvedValue({ data: job })
    const input = { platform: "YouTubeShorts", outputRelativePath: "outputs/clip.mp4", title: "Title", caption: "Caption", privacy: "private", confirmed: true, idempotencyKey: "stable-request-id" } as const
    await api.createPublishingJob("campaign-1", input)
    expect(post).toHaveBeenCalledWith("/campaigns/campaign-1/publishing/jobs", input, { headers: { "X-WhopClipper-Nonce": "nonce-123" } })
  })

  it("builds an encoded same-origin manual package URL", () => {
    expect(manualPublishingPackageUrl("job/with spaces")).toContain("/publishing/jobs/job%2Fwith%20spaces/manual-package")
  })

  it("requires explicit API envelopes for Instagram final publish and TikTok completion", async () => {
    const post = vi.spyOn(http, "post").mockResolvedValue({ data: job })

    await api.confirmInstagramPublishingJob("job-1", "final-key-1")
    expect(post).toHaveBeenLastCalledWith("/publishing/jobs/job-1/confirm-instagram", { confirmed: true, idempotencyKey: "final-key-1" }, { headers: { "X-WhopClipper-Nonce": "nonce-123" } })

    await api.completeManualPublishingJob("job-1", "https://www.tiktok.com/@creator/video/1")
    expect(post).toHaveBeenLastCalledWith("/publishing/jobs/job-1/complete-manual", { confirmed: true, postUrl: "https://www.tiktok.com/@creator/video/1" }, { headers: { "X-WhopClipper-Nonce": "nonce-123" } })
  })
})
