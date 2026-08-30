import { beforeEach, describe, expect, it, vi } from "vitest"
import { accountKitText, copyGeneratedPassword, generateStrongPassword, safeAccountFields } from "@/lib/publishing"
import type { AccountKitField } from "@/lib/types"

const fields: AccountKitField[] = [
  { key: "username", label: "Username", value: "clip_daily", required: true, copyable: true, helpText: "" },
  { key: "loginEmail", label: "Login email", value: "clips@example.test", required: true, copyable: true, helpText: "" },
  { key: "password", label: "Password", value: "must-not-leak", required: true, copyable: true, helpText: "" },
  { key: "recoveryCodes", label: "Recovery codes", value: "must-not-leak", required: false, copyable: true, helpText: "" },
]

describe("publishing security helpers", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("removes account authentication secrets before rendering or saving", () => {
    expect(safeAccountFields(fields).map((field) => field.key)).toEqual(["username", "loginEmail"])
    const text = accountKitText("TikTok", fields)
    expect(text).toContain("Username: clip_daily")
    expect(text).toContain("Login email: clips@example.test")
    expect(text).not.toContain("must-not-leak")
    expect(text).not.toMatch(/password|recovery/i)
  })

  it("generates long passwords with all required character groups", () => {
    const password = generateStrongPassword()
    expect(password).toHaveLength(24)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%^&*\-_=+]/)
    expect(generateStrongPassword()).not.toBe(password)
  })

  it("copies a generated password without returning it to the UI caller", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    await expect(copyGeneratedPassword()).resolves.toBeUndefined()
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toHaveLength(24)
  })

  it("rejects weak requested lengths", () => {
    expect(() => generateStrongPassword(12)).toThrow(/at least 16/i)
  })
})

