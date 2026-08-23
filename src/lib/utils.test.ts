import { describe, expect, it } from "vitest"
import { formatBytes, formatDate, formatDuration, toPercent } from "@/lib/utils"

describe("formatting helpers", () => {
  it("formats media durations and storage consistently", () => {
    expect(formatDuration(65)).toBe("1:05")
    expect(formatBytes(1024 ** 2)).toBe("1.0 MB")
  })

  it("normalizes confidence values", () => {
    expect(toPercent(0.86)).toBe("86%")
    expect(toPercent(86)).toBe("86%")
  })

  it("does not throw on invalid API dates", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date")
  })
})
