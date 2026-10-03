import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { saveVoiceOverIfChanged, VoiceOverCard } from "./voice-over-card"

vi.mock("@/lib/api", () => ({
  getErrorMessage: (error: Error) => error.message,
  api: { voiceOver: vi.fn(), saveVoiceOver: vi.fn(), testVoiceOver: vi.fn(), voiceOverSample: vi.fn() },
}))

const saved = { configured: false, keyHint: null, voiceId: "Gubgw9l4dtIoQA9YZHgx", modelId: "eleven_v4" }
const KEY = "sk_test_0123456789abcdef0123456789"

/** The card inside a form, as on the settings page, whose own submit must not swallow the narrator key. */
function mount(onOuterSubmit = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <form onSubmit={(event) => { event.preventDefault(); saveVoiceOverIfChanged(); onOuterSubmit() }}>
        <VoiceOverCard />
        <button type="submit">Save settings</button>
      </form>
    </QueryClientProvider>,
  )
  return onOuterSubmit
}

describe("narrator voice card", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.voiceOver).mockResolvedValue(saved)
    vi.mocked(api.saveVoiceOver).mockResolvedValue({ ...saved, configured: true, keyHint: "sk_…6789" })
  })

  it("saves the key with its own button, without submitting the settings form around it", async () => {
    const outer = mount()
    await screen.findByDisplayValue("Gubgw9l4dtIoQA9YZHgx")
    expect(screen.getByRole("button", { name: "Save voice" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: ` ${KEY} ` } })
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save voice" }))
    await waitFor(() => expect(api.saveVoiceOver).toHaveBeenCalledWith({ apiKey: KEY, voiceId: "Gubgw9l4dtIoQA9YZHgx", modelId: "eleven_v4" }))
    expect(outer).not.toHaveBeenCalled()
    expect(await screen.findByText(/Key saved/)).toBeInTheDocument()
  })

  it("saves a typed key when the page's Save settings button is pressed instead", async () => {
    // What happened: the key was typed, "Save settings" was pressed, and the key was left behind.
    mount()
    await screen.findByDisplayValue("Gubgw9l4dtIoQA9YZHgx")
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: KEY } })
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }))
    await waitFor(() => expect(api.saveVoiceOver).toHaveBeenCalledTimes(1))
  })

  it("leaves the voice alone when Save settings is pressed with nothing typed", async () => {
    const outer = mount()
    await screen.findByDisplayValue("Gubgw9l4dtIoQA9YZHgx")
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }))
    expect(outer).toHaveBeenCalled()
    expect(api.saveVoiceOver).not.toHaveBeenCalled()
  })

  it("saves on Enter in the key box", async () => {
    const outer = mount()
    await screen.findByDisplayValue("Gubgw9l4dtIoQA9YZHgx")
    const input = screen.getByLabelText("API key")
    fireEvent.change(input, { target: { value: KEY } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(api.saveVoiceOver).toHaveBeenCalledTimes(1))
    expect(outer).not.toHaveBeenCalled()
  })
})
