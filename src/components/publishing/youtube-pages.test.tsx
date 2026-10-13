import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { PublishingConnectionStatus } from "@/lib/types"
import { YouTubePages } from "./connections-panel"
import { YouTubePagePicker } from "./youtube-schedule-panel"

vi.mock("@/lib/api", () => ({
  getErrorMessage: (error: Error) => error.message,
  api: { addYouTubePage: vi.fn() },
}))

const page = (overrides: Partial<PublishingConnectionStatus>): PublishingConnectionStatus => ({
  id: "tjr", platform: "YouTubeShorts", connectionMode: "Api", status: "Configured", configuredFields: [],
  secretConfigured: { clientSecret: true, accessToken: true, refreshToken: true }, accountIdentifier: "@TJRDaily",
  grantedScopes: [], canPublish: true, capabilityMessage: "", ...overrides,
})

describe("several YouTube pages", () => {
  afterEach(cleanup)
  beforeEach(() => vi.resetAllMocks())

  it("adds a page by its handle and opens it, ready to connect", async () => {
    vi.mocked(api.addYouTubePage).mockResolvedValue(page({ id: "second", accountIdentifier: "@Second", status: "NeedsAttention", canPublish: false }))
    const select = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <YouTubePages pages={[page({ channelTitle: "TJR Daily" })]} selectedId="tjr" onSelect={select} />
      </QueryClientProvider>)

    expect(screen.getByRole("button", { name: /@TJRDaily \(TJR Daily\)/ }).getAttribute("aria-pressed")).toBe("true")
    const add = screen.getByRole("button", { name: "Add page" })
    expect(add).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Add another page"), { target: { value: " @Second " } })
    fireEvent.click(add)
    await waitFor(() => expect(api.addYouTubePage).toHaveBeenCalledWith("@Second"))
    await waitFor(() => expect(select).toHaveBeenCalledWith("second"))
  })

  it("offers a choice of page only when there is more than one", () => {
    const change = vi.fn()
    const { container, rerender } = render(
      <YouTubePagePicker label="YouTube page" pages={[{ id: "tjr", label: "@TJRDaily", ready: true }]} value="tjr" onChange={change} />)
    expect(container.firstChild).toBeNull()

    rerender(<YouTubePagePicker label="YouTube page" value="tjr" onChange={change}
      pages={[{ id: "tjr", label: "@TJRDaily", ready: true }, { id: "dc", label: "@DoubleCoverageClips", ready: false }]} />)
    expect(screen.getByRole("button", { name: "@TJRDaily" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "@DoubleCoverageClips (not signed in)" }))
    expect(change).toHaveBeenCalledWith("dc")
  })
})
