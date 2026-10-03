import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, Copy, Download, ExternalLink, Film, RefreshCw, Repeat, Scissors, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api, API_BASE_URL, getErrorMessage } from "@/lib/api"
import type { BrollEditorShot, FootageItem, FootageProgress, RenderedClip } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

/** "1:23.4" or "83.4" as seconds. Empty is undefined; anything else unreadable is NaN. */
export function parseTime(value: string): number | undefined {
  const text = value.trim()
  if (!text) return undefined
  const parts = text.split(":").map(Number)
  if (parts.some((part) => !Number.isFinite(part) || part < 0) || parts.length > 3) return Number.NaN
  return parts.reduce((total, part) => total * 60 + part, 0)
}

/** Seconds as "m:ss.s". */
export const clockOf = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(Math.max(0, seconds) % 60).toFixed(1).padStart(4, "0")}`

/** The same window the server cuts: full height of a wide frame slid by `framing`, or the centre of a tall one. */
export function cropBox(width: number, height: number, framing: number) {
  const aspect = 1080 / 960
  if (width >= height * aspect) {
    const w = height * aspect
    return { left: ((width - w) * framing) / width, top: 0, width: w / width, height: 1 }
  }
  const h = width / aspect
  return { left: 0, top: (height - h) / 2 / height, width: 1, height: h / height }
}

/** A position in a linked video, to the second: "4:46" or "1:02:03". */
export function timeOf(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = String(whole % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** The YouTube id behind a pasted link however it is written, or null for anything else. */
export function youTubeIdOf(link: string): string | null {
  try {
    const url = new URL(link.trim())
    const host = url.hostname.toLowerCase()
    const last = url.pathname.split("/").filter(Boolean).pop() ?? null
    if (host === "youtu.be") return last
    if (host === "youtube.com" || host.endsWith(".youtube.com")) return url.searchParams.get("v") ?? last
  } catch { /* not a whole link yet */ }
  return null
}

/** Which part of the linked video a footage item holds: "4:46–4:49 of 1:30:00", or "whole video". */
export function stretchOf(item: FootageItem) {
  const from = item.fromSeconds ?? 0
  const to = item.status === "Ready" ? from + item.durationSeconds : item.toSeconds
  const of = item.sourceDurationSeconds ? ` of ${timeOf(item.sourceDurationSeconds)}` : ""
  if (!from && item.toSeconds == null) return `whole video${item.status === "Ready" ? ` (${timeOf(item.durationSeconds)})` : ""}`
  return `${timeOf(from)}–${to == null ? "end" : timeOf(to)}${of}`
}

/** "Downloading 45% · 12.3 MB", or the stage the download is at. */
export function progressText(progress?: FootageProgress | null) {
  if (!progress) return "Starting..."
  if (progress.stage === "Downloading" && progress.fraction != null)
    return `Downloading ${Math.round(progress.fraction * 100)}%${progress.bytes ? ` · ${(progress.bytes / 1048576).toFixed(1)} MB` : ""}`
  return `${progress.stage}...`
}

const finished = (status?: string) => status === "Completed" || status === "Failed" || status === "Cancelled"

/**
 * The B-roll editor for one clip. The clip plays on the left with its lower-panel shots as a timeline; the transcript
 * in the middle shows what is said over each shot, so you know what footage to go and find; the footage bin on the
 * right downloads pasted links and lets you pick where in a video to start. Placing footage builds a preview first,
 * the same way an AI repair does: the soundtrack is never touched, and nothing changes until you apply it.
 */
export function BrollEditor({ campaignId, clip }: { campaignId: string; clip: RenderedClip }) {
  const planId = clip.editPlanId!
  const queryClient = useQueryClient()
  const player = useRef<HTMLVideoElement>(null)
  const footagePlayer = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [footageId, setFootageId] = useState<string | null>(null)
  const [inPoint, setInPoint] = useState(0)
  const [framing, setFraming] = useState(0.5)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const editorKey = ["broll-editor", planId]
  const editor = useQuery({
    queryKey: editorKey,
    queryFn: () => api.brollEditor(planId),
    // While anything is downloading, the list refreshes itself every second, so its progress moves.
    refetchInterval: (query) => query.state.data?.footage.some((item) => item.status === "Downloading") ? 1000 : false,
  })
  const editJob = useQuery({
    queryKey: ["job", editJobId],
    queryFn: () => api.job(editJobId!),
    enabled: Boolean(editJobId),
    refetchInterval: (query) => finished(query.state.data?.status) ? false : 1500,
  })
  const candidate = useQuery({
    queryKey: ["broll-repair", planId, editJobId],
    queryFn: () => api.brollRepairCandidate(planId, editJobId!),
    enabled: Boolean(editJobId) && editJob.data?.status === "Completed",
    retry: 1,
  })

  const data = editor.data
  const shots = useMemo(() => data?.shots ?? [], [data])
  const footage = data?.footage ?? []
  const total = data?.durationSeconds || 1
  const chosen = footage.find((item) => item.id === footageId) ?? null
  const span = range && shots.length ? {
    start: shots[range[0]].startSeconds,
    end: shots[range[1]].startSeconds + shots[range[1]].durationSeconds,
  } : null
  const spanSeconds = span ? span.end - span.start : 0
  // Each word goes with the shot it starts in.
  const wordsByShot = useMemo(() => shots.map((shot) => (data?.words ?? []).filter((word) =>
    word.start >= shot.startSeconds - 0.001 && word.start < shot.startSeconds + shot.durationSeconds - 0.001)), [shots, data])
  const clipSrc = `${API_BASE_URL}/campaigns/${campaignId}/outputs/file?path=${encodeURIComponent(clip.relativePath)}&v=${encodeURIComponent(`${clip.createdAt}-${clip.sizeBytes}`)}`

  // A newly chosen video starts from its beginning, centred, unless the stretch asked for starts further in.
  const chooseFootage = (id: string | null, from = 0) => { setFootageId(id); setInPoint(from); setFraming(0.5) }

  const refreshEditor = () => queryClient.invalidateQueries({ queryKey: editorKey })
  const add = useMutation({
    mutationFn: () => {
      const fromSeconds = parseTime(from)
      const toSeconds = parseTime(to)
      if (Number.isNaN(fromSeconds) || Number.isNaN(toSeconds)) throw new Error("Write From and To as minutes:seconds, like 1:23.")
      return api.addFootage(planId, { url: url.trim(), fromSeconds, toSeconds })
    },
    onSuccess: ({ footage: item, reused, inSeconds }) => {
      setUrl(""); setFrom(""); setTo("")
      chooseFootage(item.id, inSeconds)
      if (reused) toast.success(`You already have that part of the video, so nothing was downloaded. Picked it from ${clockOf(inSeconds)}.`)
      else toast.info("Downloading. Its progress shows in the footage list.")
      refreshEditor()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteFootage(planId, id),
    onSuccess: (_, id) => { if (footageId === id) chooseFootage(null); refreshEditor() },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const place = useMutation({
    mutationFn: () => api.startBrollEdit(planId, {
      startSeconds: span!.start, endSeconds: span!.end,
      shots: [{ footageId: chosen!.id, inSeconds: inPoint, durationSeconds: spanSeconds, framing }],
    }),
    onSuccess: (job) => setEditJobId(job.id),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const apply = useMutation({
    mutationFn: () => api.applyBrollRepair(planId, editJobId!),
    onSuccess: () => {
      toast.success("B-roll replaced. The previous version is archived.")
      setEditJobId(null)
      setRange(null)
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId, "outputs"] })
      queryClient.invalidateQueries({ queryKey: ["clip-preview", planId] })
      refreshEditor()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const seek = (seconds: number) => {
    if (player.current) { player.current.currentTime = seconds + 0.01; setTime(seconds) }
  }
  const select = (index: number, extend: boolean) => {
    setRange((current) => extend && current ? [Math.min(current[0], index), Math.max(current[1], index)] : [index, index])
    if (!extend) seek(shots[index].startSeconds)
  }
  const inRange = (index: number) => Boolean(range && index >= range[0] && index <= range[1])
  const busy = Boolean(editJobId)
  const fits = chosen?.status === "Ready" && inPoint >= 0 && inPoint + spanSeconds <= chosen.durationSeconds + 0.05
  const placeBlocked = !span ? "Pick shots on the timeline or in the transcript first."
    : !chosen ? "Pick a video from the footage bin."
      : chosen.status !== "Ready" ? `Wait for that video to finish downloading (${progressText(chosen.progress)}).`
        : !fits ? `Only ${clockOf(Math.max(0, chosen.durationSeconds - inPoint))} of the video is left after ${clockOf(inPoint)}; start earlier.`
          : busy ? "Apply or discard the preview first." : null

  if (editor.isLoading) return <p className="py-10 text-center text-sm text-[var(--fg-muted)]">Loading the editor...</p>
  if (editor.isError || !data) return <p className="py-10 text-center text-sm text-[var(--fg-muted)]">{getErrorMessage(editor.error)}</p>

  const pastedId = youTubeIdOf(url)
  const alreadyHave = pastedId ? footage.filter((item) => item.youTubeId === pastedId && item.status !== "Failed") : []
  // Newest first, so a link just pasted shows up right under the form.
  const here = footage.filter((item) => item.addedHere).reverse()
  const elsewhere = footage.filter((item) => !item.addedHere).reverse()
  const row = (item: FootageItem) => (
    <FootageRow key={item.id} item={item} selected={item.id === footageId} onSelect={() => chooseFootage(item.id)}
      onRemove={() => remove.mutate(item.id)} removing={remove.isPending && remove.variables === item.id} />
  )

  const selectedWords = range ? wordsByShot.slice(range[0], range[1] + 1).flat().map((word) => word.word).join(" ") : ""
  const searchFor = range ? (shots[range[0]].pickedByHand ? "" : shots[range[0]].query) : ""

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,340px)]">
      {/* The clip and its shots. */}
      <section className="space-y-3" aria-label="Clip">
        <div className="flex justify-center rounded-xl bg-[var(--surface-inverse)] p-2">
          <video ref={player} className="max-h-[48vh] w-auto rounded-lg" src={clipSrc} controls preload="metadata" playsInline
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--fg-strong)]">B-roll shots</p>
          <div className="relative flex h-10 w-full overflow-hidden rounded-md border border-[var(--border-default)]" role="group" aria-label="B-roll shots">
            {shots.map((shot) => (
              <button key={shot.index} type="button" onClick={(event) => select(shot.index, event.shiftKey)}
                style={{ width: `${(shot.durationSeconds / total) * 100}%` }}
                aria-label={`Shot ${shot.index + 1}, ${clockOf(shot.startSeconds)} to ${clockOf(shot.startSeconds + shot.durationSeconds)}`}
                aria-pressed={inRange(shot.index)}
                className={cn("h-full border-r border-[var(--border-default)] text-[10px] font-semibold transition last:border-r-0",
                  inRange(shot.index) ? "bg-[var(--brand-strong,#16a34a)] text-white" : shot.pickedByHand
                    ? "bg-[var(--surface-accent-subtle)] hover:bg-[var(--surface-accent)]" : "bg-[var(--surface-subtle)] hover:bg-[var(--surface-raised)]")}>
                {shot.index + 1}
              </button>
            ))}
            <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#e11d48]" style={{ left: `${Math.min(100, (time / total) * 100)}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-[var(--fg-muted)]">Click a shot to select it; shift-click another to select everything between.</p>
          {data.gaps.length ? (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--warning-text,#b45309)]">
              <AlertTriangle className="size-3" /> {data.gaps.length} stretch{data.gaps.length === 1 ? "" : "es"} had no matching footage when the clip was made.
            </p>
          ) : null}
        </div>
        {span ? (
          <div className="rounded-lg bg-[var(--surface-subtle)] p-2.5 text-xs">
            <p className="font-semibold text-[var(--fg-strong)]">
              {range![0] === range![1] ? `Shot ${range![0] + 1}` : `Shots ${range![0] + 1} to ${range![1] + 1}`} · {clockOf(span.start)} to {clockOf(span.end)} ({spanSeconds.toFixed(1)} s)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {searchFor ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchFor)}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Search YouTube
                  </a>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={async () => {
                try { await navigator.clipboard.writeText(selectedWords); toast.success("Words copied") }
                catch { toast.error("Could not copy. Select the words and copy them manually.") }
              }}><Copy /> Copy words</Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* What is said over each shot. */}
      <section className="min-w-0" aria-label="Transcript">
        <p className="mb-1 text-[11px] font-semibold text-[var(--fg-strong)]">Transcript by shot</p>
        <ol className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
          {shots.map((shot, index) => (
            <TranscriptShot key={shot.index} shot={shot} words={wordsByShot[index]} selected={inRange(shot.index)} time={time}
              onSelect={(extend) => select(shot.index, extend)} onSeek={seek} />
          ))}
        </ol>
      </section>

      {/* Footage bin and placement. */}
      <section className="min-w-0 space-y-3" aria-label="Footage bin">
        <form className="space-y-2 rounded-xl border border-[var(--border-default)] p-3"
          onSubmit={(event) => { event.preventDefault(); if (url.trim()) add.mutate() }}>
          <p className="text-[11px] font-semibold text-[var(--fg-strong)]">Download footage</p>
          <Input aria-label="Video link" placeholder="Paste a YouTube link" value={url} onChange={(event) => setUrl(event.target.value)} />
          {alreadyHave.length ? (
            <p className="flex gap-1 text-[10px] text-[var(--fg-strong)]">
              <Repeat className="mt-px size-3 shrink-0" />
              <span>You already have {alreadyHave.length === 1 ? "part" : `${alreadyHave.length} parts`} of this video
                ({alreadyHave.map(stretchOf).join(", ")}). A stretch inside one of them is reused, not downloaded again.</span>
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="From" placeholder="From (m:ss)" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input aria-label="To" placeholder="To (m:ss)" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={!url.trim() || add.isPending}>
            <Download /> {add.isPending ? "Adding..." : "Download to this clip"}
          </Button>
          <p className="text-[10px] text-[var(--fg-muted)]">
            Leave From and To empty for the whole video (up to 30 minutes). Video only: the clip keeps its own sound.
            Downloads are kept for every clip in this campaign.
          </p>
        </form>

        <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <p className="mb-1 text-[11px] font-semibold text-[var(--fg-strong)]">Footage for this clip</p>
            <ul className="space-y-1.5" aria-label="Footage">
              {here.length === 0 ? <li className="text-xs text-[var(--fg-muted)]">None yet. Paste a link above{elsewhere.length ? ", or use one from another clip below" : ""}.</li> : null}
              {here.map(row)}
            </ul>
          </div>
          {elsewhere.length ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[var(--fg-strong)]">From your other clips</p>
              <ul className="space-y-1.5" aria-label="Footage from other clips">{elsewhere.map(row)}</ul>
            </div>
          ) : null}
        </div>

        {chosen?.status === "Ready" ? (
          <div className="space-y-2 rounded-xl border border-[var(--border-default)] p-3">
            <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${chosen.width || 16} / ${chosen.height || 9}` }}>
              <video ref={footagePlayer} className="size-full" src={api.footageUrl(planId, chosen.id)} controls muted preload="metadata" playsInline />
              {(() => {
                const box = cropBox(chosen.width || 16, chosen.height || 9, framing)
                return (
                  <span className="pointer-events-none absolute border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />
                )
              })()}
            </div>
            <FootageUseBar item={chosen} inPoint={inPoint} span={spanSeconds} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">Starts at {clockOf(inPoint)}</span>
              <Button variant="outline" size="sm" onClick={() => setInPoint(Math.round((footagePlayer.current?.currentTime ?? 0) * 10) / 10)}>
                Use player time
              </Button>
            </div>
            <label className="block text-[11px] font-semibold text-[var(--fg-strong)]" htmlFor="broll-framing">
              Framing <span className="font-normal text-[var(--fg-muted)]">(the bright box is what shows)</span>
              <input id="broll-framing" type="range" min={0} max={100} value={Math.round(framing * 100)} className="w-full"
                onChange={(event) => setFraming(Number(event.target.value) / 100)} />
            </label>
          </div>
        ) : null}

        {busy ? (
          <EditPreview job={editJob.data} candidateUrl={candidate.data?.previewUrl}
            candidateMissing={candidate.isError} applying={apply.isPending}
            onApply={() => apply.mutate()} onDiscard={() => setEditJobId(null)} />
        ) : (
          <div className="space-y-1">
            <Button className="w-full" disabled={Boolean(placeBlocked) || place.isPending} onClick={() => place.mutate()}>
              <Scissors /> {place.isPending ? "Starting..." : span && chosen
                ? `Use ${spanSeconds.toFixed(1)} s from ${clockOf(inPoint)}` : "Place footage"}
            </Button>
            {placeBlocked ? <p className="text-[10px] text-[var(--fg-muted)]">{placeBlocked}</p> : null}
          </div>
        )}
      </section>
    </div>
  )
}

function TranscriptShot({ shot, words, selected, time, onSelect, onSeek }: {
  shot: BrollEditorShot; words: Array<{ start: number; end: number; word: string }>; selected: boolean; time: number
  onSelect: (extend: boolean) => void; onSeek: (seconds: number) => void
}) {
  const end = shot.startSeconds + shot.durationSeconds
  const playing = time >= shot.startSeconds && time < end
  return (
    <li className={cn("rounded-lg border p-2", selected ? "border-[var(--brand-strong,#16a34a)] bg-[var(--surface-accent-subtle)]"
      : playing ? "border-[var(--border-strong)]" : "border-[var(--border-default)]")}>
      <button type="button" className="flex w-full flex-wrap items-center gap-1.5 text-left text-[11px] font-semibold text-[var(--fg-muted)]"
        onClick={(event) => onSelect(event.shiftKey)}>
        <span className="text-[var(--fg-strong)]">Shot {shot.index + 1}</span>
        <span className="tabular-nums">{clockOf(shot.startSeconds)}–{clockOf(end)}</span>
        {shot.pickedByHand ? <Badge variant="success">picked by you</Badge> : null}
        <span className="min-w-0 truncate font-normal">{shot.sourceTitle || shot.query}</span>
      </button>
      <p className="mt-1 text-sm leading-relaxed text-[var(--fg-body)]">
        {words.length ? words.map((word, index) => (
          <button key={`${word.start}-${index}`} type="button" onClick={() => onSeek(word.start)}
            className={cn("mr-1 rounded px-0.5 hover:bg-[var(--surface-raised)]",
              time >= word.start && time < word.end && "bg-[#fde68a] text-black")}>
            {word.word}
          </button>
        )) : <span className="text-xs text-[var(--fg-muted)]">(no words spoken)</span>}
      </p>
    </li>
  )
}

function FootageThumb({ item }: { item: FootageItem }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="flex h-10 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--surface-subtle)]">
      {item.youTubeId && !broken
        ? <img src={`https://i.ytimg.com/vi/${item.youTubeId}/mqdefault.jpg`} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
        : <Film className="size-4 text-[var(--fg-muted)]" />}
    </span>
  )
}

/** One downloaded video: what it is, which part of it was kept, and what it is doing or has been used for. */
function FootageRow({ item, selected, onSelect, onRemove, removing }: {
  item: FootageItem; selected: boolean; onSelect: () => void; onRemove: () => void; removing: boolean
}) {
  const titled = Boolean(item.title) && item.title !== item.url
  const shots = item.usedHere.map((use) => use.shot + 1)
  return (
    <li className={cn("flex items-start gap-1 rounded-lg border p-2", selected ? "border-[var(--brand-strong,#16a34a)] bg-[var(--surface-accent-subtle)]" : "border-[var(--border-default)]")}>
      <button type="button" className="flex min-w-0 flex-1 gap-2 text-left" onClick={onSelect} disabled={item.status === "Failed"}>
        <FootageThumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-xs font-semibold text-[var(--fg-strong)]">{titled ? item.title : "Getting the title..."}</span>
          <span className="block truncate text-[10px] text-[var(--fg-muted)]">
            {[item.channel, stretchOf(item), item.status === "Ready" ? `${item.durationSeconds.toFixed(1)} s` : null].filter(Boolean).join(" · ")}
          </span>
          {item.status === "Downloading" ? (
            <span className="mt-1 block space-y-0.5">
              <Progress value={Math.round((item.progress?.fraction ?? 0) * 100)} className="h-1.5" />
              <span className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                <RefreshCw className="size-3 animate-spin" /> {progressText(item.progress)}
              </span>
            </span>
          ) : item.status === "Failed" ? (
            <span className="block text-[10px] text-[var(--warning-text,#b45309)]">Failed: {item.error ?? "unknown error"}</span>
          ) : (
            <span className="block text-[10px] text-[var(--fg-muted)]">
              {shots.length ? <span className="font-semibold text-[var(--fg-strong)]">Used on shot{shots.length === 1 ? "" : "s"} {shots.join(", ")}</span> : "Not used in this clip yet"}
              {item.addedIn ? <> · added for “{item.addedIn}”</> : null}
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 flex-col">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${titled ? item.title : "the video"} on its site`} title="Open the video">
            <ExternalLink />
          </a>
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Remove ${item.title}`}
          title="Remove from your footage (every clip). Clips already made with it keep their shots."
          disabled={item.status === "Downloading" || removing} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

/** The chosen video as a strip: the parts this clip already uses, and the part "Use" will take. */
function FootageUseBar({ item, inPoint, span }: { item: FootageItem; inPoint: number; span: number }) {
  const length = item.durationSeconds || 1
  const pct = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / length) * 100))}%`
  const used = item.usedHere.filter((use) => use.inSeconds != null)
  return (
    <div className="space-y-1">
      <div className="relative h-2.5 overflow-hidden rounded bg-[var(--surface-subtle)]" aria-hidden>
        {used.map((use) => (
          <span key={use.shot} className="absolute inset-y-0 bg-[#f59e0b]" title={`Shot ${use.shot + 1}`}
            style={{ left: pct(use.inSeconds!), width: pct(use.durationSeconds) }} />
        ))}
        {span > 0 ? <span className="absolute inset-y-0 rounded-sm border-2 border-[var(--brand-strong,#16a34a)]"
          style={{ left: pct(inPoint), width: pct(span) }} /> : null}
      </div>
      <p className="text-[10px] text-[var(--fg-muted)]">
        {used.length ? <>Orange: already on shot{used.length === 1 ? "" : "s"} {used.map((use) => use.shot + 1).join(", ")} of this clip. </> : null}
        {span > 0 ? "Green: the part that will be used." : "Pick shots to see the part that will be used."}
      </p>
    </div>
  )
}

function EditPreview({ job, candidateUrl, candidateMissing, applying, onApply, onDiscard }: {
  job?: { status: string; progress?: number | null; errorSummary?: string | null }
  candidateUrl?: string; candidateMissing: boolean; applying: boolean; onApply: () => void; onDiscard: () => void
}) {
  if (!job || !finished(job.status)) {
    return (
      <div className="space-y-1.5 rounded-lg bg-[var(--surface-subtle)] p-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold"><RefreshCw className="size-3.5 animate-spin" /> Building the preview...</p>
        <Progress value={job?.progress ?? 0} />
      </div>
    )
  }
  if (job.status !== "Completed" || candidateMissing) {
    return (
      <div className="space-y-2 rounded-lg bg-[var(--surface-subtle)] p-2.5 text-xs">
        <p className="text-[var(--warning-text,#b45309)]">{job.errorSummary || "The preview could not be built. The clip was not changed."}</p>
        <Button variant="outline" size="sm" onClick={onDiscard}>Try something else</Button>
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-lg bg-[var(--surface-subtle)] p-2.5">
      <p className="text-xs font-semibold">Preview with your footage</p>
      {candidateUrl ? <video className="mx-auto max-h-72 rounded-md" controls preload="metadata" playsInline
        src={`${API_BASE_URL.replace(/\/api$/, "")}${candidateUrl}`} /> : <p className="text-xs">Loading the preview...</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={applying || !candidateUrl} onClick={onApply}><Check /> {applying ? "Applying..." : "Apply"}</Button>
        <Button variant="ghost" size="sm" disabled={applying} onClick={onDiscard}>Discard</Button>
      </div>
      <p className="text-[10px] text-[var(--fg-muted)]">Nothing changes until you apply. The sound stays exactly as it is.</p>
    </div>
  )
}
