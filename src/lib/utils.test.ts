import { describe, expect, it } from "vitest"
import { formatBytes, formatDate, formatDay, formatDuration, toPercent } from "@/lib/utils"

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

  it("shows a bare calendar day as that day, whatever the time zone", () => {
    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
      .format(new Date(Date.UTC(2026, 8, 15)))
    expect(formatDay("2026-09-15")).toBe(expected)
    expect(formatDay(null)).toBe("—")
    expect(formatDay("not-a-date")).toBe("not-a-date")
  })
})
