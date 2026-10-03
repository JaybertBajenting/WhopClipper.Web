import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import type { BrollEditorData, Job, RenderedClip } from "@/lib/types"
import { BrollEditor, cropBox, parseTime, progressText, stretchOf, timeOf, youTubeIdOf } from "./broll-editor"

vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://localhost:5000/api",
  getErrorMessage: (error: Error) => error.message,
  api: { brollEditor: vi.fn(), addFootage: vi.fn(), deleteFootage: vi.fn(), startBrollEdit: vi.fn(), job: vi.fn(),
    brollRepairCandidate: vi.fn(), applyBrollRepair: vi.fn(), footageUrl: (plan: string, id: string) => `/footage/${plan}/${id}` },
}))

const clip: RenderedClip = {
  relativePath: "out/final.mp4", fileName: "final.mp4", platform: "TikTok", sizeBytes: 123,
  createdAt: "2026-09-30T01:00:00Z", editPlanId: "plan", title: "Mike Majlak's petition",
}
const editor: BrollEditorData = {
  planId: "plan", title: "Mike Majlak's petition", durationSeconds: 10,
  shots: [
    { index: 0, startSeconds: 0, durationSeconds: 4, sourceTitle: "Logan Paul at WrestleMania", query: "Logan Paul vlog", pickedByHand: false },
    { index: 1, startSeconds: 4, durationSeconds: 3.5, sourceTitle: "Mike Majlak interview", query: "Mike Majlak podcast", pickedByHand: false },
    { index: 2, startSeconds: 7.5, durationSeconds: 2.5, sourceTitle: "White House", query: "Logan Paul White House", pickedByHand: false },
  ],
  gaps: [],
  words: [
    { start: 0.2, end: 0.6, word: "I" }, { start: 0.6, end: 1.0, word: "started" }, { start: 4.2, end: 4.6, word: "petition" },
    { start: 7.6, end: 8.0, word: "White" }, { start: 8.0, end: 8.4, word: "House" },
  ],
  footage: [
    { id: "long", url: "https://youtu.be/a", title: "Logan Paul vlog", status: "Ready", durationSeconds: 60, width: 1920, height: 1080, createdAt: "2026-09-30T00:00:00Z", addedHere: true, usedHere: [] },
    { id: "short", url: "https://youtu.be/b", title: "Two second clip", status: "Ready", durationSeconds: 2, width: 1920, height: 1080, createdAt: "2026-09-30T00:01:00Z", addedHere: true, usedHere: [] },
  ],
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><BrollEditor campaignId="campaign" clip={clip} /></QueryClientProvider>)
}

describe("reading times and framing", () => {
  it("reads minutes:seconds, plain seconds and nothing", () => {
    expect(parseTime("1:23")).toBe(83)
    expect(parseTime("1:02:03.5")).toBe(3723.5)
    expect(parseTime(" 45.5 ")).toBe(45.5)
    expect(parseTime("")).toBeUndefined()
    expect(parseTime("abc")).toBeNaN()
    expect(parseTime("-3")).toBeNaN()
  })

  it("names the video behind a link however it is written", () => {
    expect(youTubeIdOf("https://www.youtube.com/watch?v=8m-4hF_AB_c&t=286s")).toBe("8m-4hF_AB_c")
    expect(youTubeIdOf(" https://youtu.be/8m-4hF_AB_c?si=x ")).toBe("8m-4hF_AB_c")
    expect(youTubeIdOf("https://www.youtube.com/shorts/8m-4hF_AB_c")).toBe("8m-4hF_AB_c")
    expect(youTubeIdOf("https://vimeo.com/1")).toBeNull()
    expect(youTubeIdOf("half a link")).toBeNull()
  })

  it("says which part of a video was kept and how far a download has got", () => {
    const item = { ...editor.footage[0], fromSeconds: 286, toSeconds: 289, durationSeconds: 3.02, sourceDurationSeconds: 5400 }
    expect(stretchOf(item)).toBe("4:46–4:49 of 1:30:00")
    expect(stretchOf({ ...item, fromSeconds: null, toSeconds: null, durationSeconds: 95 })).toBe("whole video (1:35)")
    expect(timeOf(3723.4)).toBe("1:02:03")
    expect(progressText({ stage: "Downloading", fraction: 0.456, bytes: 12_900_000 })).toBe("Downloading 46% · 12.3 MB")
    expect(progressText({ stage: "Waiting for another download to finish" })).toBe("Waiting for another download to finish...")
    expect(progressText(null)).toBe("Starting...")
  })

  it("shows the window the server will cut", () => {
    const wide = cropBox(1920, 1080, 0.5)
    expect(wide.width).toBeCloseTo(1215 / 1920)
    expect(wide.left).toBeCloseTo((1920 - 1215) / 2 / 1920)
    expect(cropBox(1080, 1920, 0.9)).toMatchObject({ left: 0, width: 1 })
  })
})

describe("B-roll editor", () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.brollEditor).mockResolvedValue(editor)
  })

  it("lists what is said over each shot", async () => {
    mount()
    const transcript = await screen.findByRole("region", { name: "Transcript" })
    const shots = within(transcript).getAllByRole("listitem")
    expect(shots).toHaveLength(3)
    expect(within(shots[0]).getByText("started")).toBeInTheDocument()
    expect(within(shots[1]).getByText("petition")).toBeInTheDocument()
    expect(within(shots[2]).getByText("House")).toBeInTheDocument()
    expect(within(shots[1]).getByText("Mike Majlak interview")).toBeInTheDocument()
  })

  it("downloads a pasted link with the stretch asked for", async () => {
    vi.mocked(api.addFootage).mockResolvedValue({ footage: { id: "new", title: "x" }, job: { id: "job" } as Job, reused: false, inSeconds: 0 })
    mount()
    fireEvent.change(await screen.findByRole("textbox", { name: "Video link" }), { target: { value: " https://youtu.be/xyz " } })
    fireEvent.change(screen.getByRole("textbox", { name: "From" }), { target: { value: "1:05" } })
    fireEvent.change(screen.getByRole("textbox", { name: "To" }), { target: { value: "2:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Download to this clip" }))
    await waitFor(() => expect(api.addFootage).toHaveBeenCalledWith("plan", { url: "https://youtu.be/xyz", fromSeconds: 65, toSeconds: 120 }))
  })

  it("places footage over exactly the selected run of shots", async () => {
    vi.mocked(api.startBrollEdit).mockResolvedValue({ id: "edit-job", status: "Queued" } as Job)
    vi.mocked(api.job).mockResolvedValue({ id: "edit-job", status: "Running", progress: 40 } as Job)
    mount()
    fireEvent.click(await screen.findByRole("button", { name: /^Shot 2, / }))
    fireEvent.click(screen.getByRole("button", { name: /^Shot 3, / }), { shiftKey: true })
    expect(screen.getByText(/Shots 2 to 3 · 0:04.0 to 0:10.0 \(6.0 s\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^Logan Paul vlog/ }))
    fireEvent.click(screen.getByRole("button", { name: "Use 6.0 s from 0:00.0" }))
    await waitFor(() => expect(api.startBrollEdit).toHaveBeenCalledWith("plan", {
      startSeconds: 4, endSeconds: 10, shots: [{ footageId: "long", inSeconds: 0, durationSeconds: 6, framing: 0.5 }],
    }))
    expect(await screen.findByText("Building the preview...")).toBeInTheDocument()
  })

  it("will not place a video that is shorter than the selected shots", async () => {
    mount()
    fireEvent.click(await screen.findByRole("button", { name: /^Shot 1, / }))
    fireEvent.click(screen.getByRole("button", { name: /^Two second clip/ }))
    expect(screen.getByRole("button", { name: "Use 4.0 s from 0:00.0" })).toBeDisabled()
    expect(screen.getByText(/Only 0:02.0 of the video is left/)).toBeInTheDocument()
    expect(api.startBrollEdit).not.toHaveBeenCalled()
  })

  it("shows a download's progress instead of a bare spinner", async () => {
    vi.mocked(api.brollEditor).mockResolvedValue({ ...editor, footage: [{ ...editor.footage[0], id: "dl", status: "Downloading",
      title: "https://youtu.be/xyz", url: "https://youtu.be/xyz", youTubeId: "xyz", fromSeconds: 123, toSeconds: 126,
      progress: { stage: "Downloading", fraction: 0.4, bytes: 2_097_152 } }] })
    mount()
    const list = await screen.findByRole("list", { name: "Footage" })
    expect(within(list).getByText("Getting the title...")).toBeInTheDocument()
    expect(within(list).getByText(/Downloading 40% · 2.0 MB/)).toBeInTheDocument()
    expect(within(list).getByText("2:03–2:06")).toBeInTheDocument()
    expect(within(list).getByRole("progressbar")).toBeInTheDocument()
  })

  it("reuses a stretch it already has instead of downloading it again", async () => {
    vi.mocked(api.brollEditor).mockResolvedValue({ ...editor, footage: [{ ...editor.footage[0], youTubeId: "a", fromSeconds: 100,
      toSeconds: 160, sourceDurationSeconds: 900 }] })
    vi.mocked(api.addFootage).mockResolvedValue({ footage: { id: "long", title: "Logan Paul vlog" }, job: null, reused: true, inSeconds: 6 })
    mount()
    fireEvent.click(await screen.findByRole("button", { name: /^Shot 2, / }))
    fireEvent.change(screen.getByRole("textbox", { name: "Video link" }), { target: { value: "https://www.youtube.com/watch?v=a&t=106" } })
    expect(screen.getByText(/You already have part of this video/)).toHaveTextContent("1:40–2:40 of 15:00")
    fireEvent.change(screen.getByRole("textbox", { name: "From" }), { target: { value: "1:46" } })
    fireEvent.change(screen.getByRole("textbox", { name: "To" }), { target: { value: "1:50" } })
    fireEvent.click(screen.getByRole("button", { name: "Download to this clip" }))
    expect(await screen.findByRole("button", { name: "Use 3.5 s from 0:06.0" })).toBeEnabled()
  })

  it("offers footage from other clips and says what it is used for here", async () => {
    vi.mocked(api.brollEditor).mockResolvedValue({ ...editor, footage: [
      { ...editor.footage[0], usedHere: [{ shot: 1, inSeconds: 10, durationSeconds: 3.5 }] },
      { ...editor.footage[1], id: "other", title: "Steve on NELK", addedHere: false, addedIn: "Mike's Bikes" },
    ] })
    mount()
    const here = await screen.findByRole("list", { name: "Footage" })
    expect(within(here).getByText("Used on shot 2")).toBeInTheDocument()
    const other = screen.getByRole("list", { name: "Footage from other clips" })
    expect(within(other).getByText("Steve on NELK")).toBeInTheDocument()
    expect(within(other).getByText(/added for “Mike's Bikes”/)).toBeInTheDocument()
    fireEvent.click(within(here).getByRole("button", { name: /^Logan Paul vlog/ }))
    expect(screen.getByText(/Orange: already on shot 2 of this clip/)).toBeInTheDocument()
  })
})
