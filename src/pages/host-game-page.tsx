import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Copy, ExternalLink, ImageUp, LoaderCircle, Pause, Play, Plus, Radio, RotateCcw, SkipForward, Square, Trash2, Users } from "lucide-react"
import { Link, Navigate, useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Leaderboard } from "@/components/leaderboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useGameUpdates } from "@/hooks/use-game-updates"
import { api, hostKeyStorage } from "@/lib/api"
import type { HostGame } from "@/lib/types"

export function HostGamePage() {
  const { gameId = "" } = useParams()
  const hostKey = sessionStorage.getItem(hostKeyStorage)
  const [game, setGame] = useState<HostGame | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [correctAnswer, setCorrectAnswer] = useState("")
  const [choices, setChoices] = useState("")
  const [funFact, setFunFact] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [imagePath, setImagePath] = useState("")
  const [duration, setDuration] = useState(30)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    if (!hostKey || !gameId) return
    try { setGame(await api.hostGame(hostKey, gameId)); setError("") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the game.") }
  }, [gameId, hostKey])
  useGameUpdates(game?.code, refresh)
  useEffect(() => {
    const initial = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 3000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [refresh])

  const leaderboard = useMemo(() => game?.players.map((player) => ({ rank: player.rank, playerId: player.id, displayName: player.displayName, totalScore: player.totalScore })) ?? [], [game])
  if (!hostKey) return <Navigate to="/host" replace />
  if (!game) return <AppShell><div className="grid min-h-[70vh] place-items-center"><LoaderCircle className="size-9 animate-spin text-amber-300" /></div></AppShell>

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true); setError("")
    try { await action(); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The action failed.") }
    finally { setBusy(false) }
  }

  async function upload(file?: File) {
    if (!file) return
    setUploading(true); setError("")
    try { const result = await api.uploadImage(hostKey!, file); setImagePath(result.imagePath); setImageUrl("") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Image upload failed.") }
    finally { setUploading(false) }
  }

  async function createRound(event: FormEvent) {
    event.preventDefault()
    const options = choices.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean)
    await mutate(() => api.createRound(hostKey!, gameId, { correctAnswer, options, funFact: funFact || null, imagePath: imagePath || null, imageUrl: imageUrl || null, durationSeconds: duration }))
    setCorrectAnswer(""); setChoices(""); setFunFact(""); setImageUrl(""); setImagePath(""); setDuration(30)
  }

  const currentRound = [...game.rounds].reverse().find((round) => round.status === "Open" || round.status === "Revealed")

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link to="/host/games">← All games</Link></Button><h1 className="text-3xl font-black">{game.title}</h1><div className="mt-2 flex flex-wrap gap-2"><Badge className="font-mono tracking-widest">{game.code}</Badge><Badge variant="secondary"><Users /> {game.players.length}</Badge><Badge variant={game.status === "Finished" ? "success" : "default"}>{game.status}</Badge></div></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${game.code}`)}><Copy /> Copy join link</Button><Button asChild><Link to={`/present/${game.code}`} target="_blank"><ExternalLink /> Open projector</Link></Button></div>
        </div>
        {error && <p className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card><CardContent className="p-5"><p className="text-sm text-zinc-500">Players joined</p><p className="mt-1 text-3xl font-black">{game.players.length}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-zinc-500">Rounds configured</p><p className="mt-1 text-3xl font-black">{game.rounds.length}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-zinc-500">Room code</p><p className="mt-1 font-mono text-3xl font-black tracking-[0.15em] text-amber-300">{game.code}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Radio className="text-amber-300" /> Automatic game controls</CardTitle><CardDescription>Start once and the server handles every timer, reveal, next round, and the final leaderboard. Reveals stay visible for {game.revealDurationSeconds} seconds.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">{game.status === "Lobby" && <Button size="lg" onClick={() => mutate(() => api.startGame(hostKey!, gameId))} disabled={busy || game.rounds.length === 0}><Play /> Start game</Button>}{game.status === "Live" && <><Button size="lg" variant="secondary" onClick={() => mutate(() => api.pauseGame(hostKey!, gameId))} disabled={busy}><Pause /> Pause</Button><Button size="lg" variant="outline" onClick={() => mutate(() => api.skipPhase(hostKey!, gameId))} disabled={busy}><SkipForward /> {currentRound?.status === "Open" ? "Reveal now" : "Next round now"}</Button></>}{game.status === "Paused" && <Button size="lg" onClick={() => mutate(() => api.resumeGame(hostKey!, gameId))} disabled={busy}><RotateCcw /> Resume</Button>}{game.status !== "Finished" && game.status !== "Lobby" && <Button variant="destructive" size="lg" onClick={() => mutate(() => api.endGame(hostKey!, gameId))} disabled={busy}><Square /> End game</Button>}{game.status === "Finished" && <span className="text-sm text-emerald-300">The game is complete. The final leaderboard is live.</span>}</CardContent></Card>

            <Card><CardHeader><CardTitle>Rounds</CardTitle><CardDescription>The correct answer is visible here only—players do not receive it until reveal.</CardDescription></CardHeader><CardContent className="space-y-3">{game.rounds.length === 0 ? <p className="py-8 text-center text-zinc-500">Add your first workstation below.</p> : game.rounds.map((round) => <div key={round.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><div className="grid size-10 place-items-center rounded-lg bg-zinc-800 font-mono font-bold">{round.position}</div><div className="min-w-0 flex-1"><p className="font-semibold">{round.correctAnswer}</p><p className="truncate text-sm text-zinc-500">{round.options.join(" · ")}</p></div><Badge variant={round.status === "Revealed" ? "success" : round.status === "Open" ? "default" : "secondary"}>{round.status}</Badge><span className="text-sm text-zinc-500">{round.answerCount} answers</span>{game.status === "Lobby" && round.status === "Pending" && <Button variant="ghost" size="icon" aria-label={`Delete round ${round.position}`} onClick={() => mutate(() => api.deleteRound(hostKey!, gameId, round.id))} disabled={busy}><Trash2 /></Button>}</div>)}</CardContent></Card>

            {game.status === "Lobby" && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="text-amber-300" /> Add workstation</CardTitle><CardDescription>Upload to your private Supabase bucket or provide an externally hosted image URL.</CardDescription></CardHeader><CardContent><form onSubmit={createRound} className="grid gap-5 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="correct">Workstation owner</Label><Input id="correct" value={correctAnswer} onChange={(event) => setCorrectAnswer(event.target.value)} placeholder="Alex" required maxLength={80} /></div><div className="space-y-2"><Label htmlFor="duration">Round time (seconds)</Label><Input id="duration" type="number" min={10} max={180} value={duration} onChange={(event) => setDuration(Number(event.target.value))} required /></div><div className="space-y-2 md:col-span-2"><Label htmlFor="choices">Choices, one per line</Label><Textarea id="choices" value={choices} onChange={(event) => setChoices(event.target.value)} placeholder={"Alex\nJamie\nMorgan\nSam"} required /><p className="text-xs text-zinc-500">Include the exact workstation owner name above.</p></div><div className="space-y-2 md:col-span-2"><Label htmlFor="fact">Reveal fact (optional)</Label><Input id="fact" value={funFact} onChange={(event) => setFunFact(event.target.value)} placeholder="Has three mechanical keyboards but uses only one." maxLength={280} /></div><div className="space-y-2"><Label htmlFor="image">Upload image</Label><label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-600 bg-zinc-950/50 text-sm text-zinc-300 hover:border-amber-400"><ImageUp className="size-4" /> {uploading ? "Uploading…" : imagePath ? "Uploaded ✓" : "Choose JPG, PNG, or WebP"}<input id="image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} disabled={uploading} /></label></div><div className="space-y-2"><Label htmlFor="image-url">Or image URL</Label><Input id="image-url" type="url" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); if (event.target.value) setImagePath("") }} placeholder="https://…" /></div><div className="md:col-span-2"><Separator className="mb-5" /><Button size="lg" type="submit" disabled={busy || uploading || (!imagePath && !imageUrl)}>{busy ? "Saving…" : "Add round"}</Button></div></form></CardContent></Card>}
          </div>

          <Card className="h-fit"><CardHeader><CardTitle>Leaderboard</CardTitle><CardDescription>Scoring uses server receipt time.</CardDescription></CardHeader><CardContent><Leaderboard entries={leaderboard} /></CardContent></Card>
        </div>
      </div>
    </AppShell>
  )
}
