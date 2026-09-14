import { describe, expect, it } from "vitest"
import { DEFAULT_EDIT_STYLE, describeClipStyle, editStyleSignature } from "@/lib/edit-style"

describe("describeClipStyle", () => {
  it("summarises a podcast-split clip, counting gaps so a clip with missing footage stands out", () => {
    const result = describeClipStyle({
      style: "PodcastSplit", pieces: 5, cameraShots: 6, brollShots: 9,
      gaps: [{ atSeconds: 4, durationSeconds: 2.2, query: "kobe game winner", reason: "No usable video came back for this search." }],
      footage: [],
    })
    expect(result).toEqual({ summary: "5 pieces · 9 B-roll shots · 1 gap", gapCount: 1 })
  })

  it("says nothing for streamer clips, which have no footage to report", () => {
    expect(describeClipStyle(null)).toBeNull()
    expect(describeClipStyle({ style: "Streamer", pieces: 1, cameraShots: 1, brollShots: 0, gaps: [], footage: [] })).toBeNull()
  })
})

describe("editStyleSignature", () => {
  it("treats a campaign with no stored style as the default, so the card does not report unsaved changes", () => {
    expect(editStyleSignature(null)).toBe(editStyleSignature(DEFAULT_EDIT_STYLE))
    expect(editStyleSignature({ ...DEFAULT_EDIT_STYLE, style: "PodcastSplit" })).not.toBe(editStyleSignature(null))
  })
})
