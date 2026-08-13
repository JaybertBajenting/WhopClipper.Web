import { useCallback, useEffect, useState } from "react"
import { LoaderCircle, Radio, Trophy, Users } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Leaderboard } from "@/components/leaderboard"
import { Timer } from "@/components/timer"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCountdown } from "@/hooks/use-countdown"
import { useGameUpdates } from "@/hooks/use-game-updates"
import { api, apiAssetUrl } from "@/lib/api"
import type { PublicGameState } from "@/lib/types"

export function PresentationPage() {
  const { code = "" } = useParams()
  const [state, setState] = useState<PublicGameState | null>(null)
  const refresh = useCallback(() => api.gameState(code).then(setState).catch(() => undefined), [code])
  useGameUpdates(code, refresh)
  useEffect(() => {
    const initial = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 2500)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [refresh])
  const remaining = useCountdown(state?.round?.openedAt, state?.round?.durationSeconds)

  if (!state) return <AppShell compact><div className="grid min-h-screen place-items-center"><LoaderCircle className="size-12 animate-spin text-amber-300" /></div></AppShell>

  const joinUrl = `${window.location.origin}/join/${state.game.code}`
  const round = state.round
  const isLobby = state.game.status === "Lobby" && !round
  const isFinished = state.game.status === "Finished"

  return (
    <AppShell compact>
      <div className="min-h-screen p-6 lg:p-10">
        <header className="mb-6 flex items-center justify-between gap-5">
          <div><p className="text-lg text-zinc-500">{state.game.title}</p><h1 className="text-3xl font-black">Desk Detective</h1></div>
          <div className="flex items-center gap-3"><Badge variant="secondary" className="px-4 py-2 text-base"><Users /> {state.game.playerCount} playing</Badge><Badge className="px-4 py-2 font-mono text-base">{state.game.code}</Badge></div>
        </header>

        {isLobby && (
          <div className="grid min-h-[78vh] items-center gap-10 lg:grid-cols-[1fr_420px]">
            <div><Radio className="mb-6 size-16 animate-pulse text-amber-300" /><p className="mb-3 text-xl font-semibold uppercase tracking-[0.2em] text-amber-300">Join now</p><h2 className="text-7xl font-black tracking-[-0.05em]">Who knows the team best?</h2><p className="mt-6 max-w-3xl text-2xl text-zinc-400">Scan the code or visit this page on your laptop, then enter your name.</p></div>
            <Card><CardContent className="grid place-items-center p-8"><div className="rounded-2xl bg-white p-5"><QRCodeSVG value={joinUrl} size={300} /></div><p className="mt-6 font-mono text-3xl font-bold tracking-[0.3em] text-amber-300">{state.game.code}</p><p className="mt-2 max-w-full truncate text-zinc-500">{joinUrl}</p></CardContent></Card>
          </div>
        )}

        {isFinished && (
          <div className="mx-auto grid max-w-5xl gap-8 py-8 lg:grid-cols-[0.8fr_1.2fr]"><div className="flex flex-col justify-center"><Trophy className="mb-6 size-24 text-amber-300" /><h2 className="text-7xl font-black tracking-tight">Case closed.</h2><p className="mt-5 text-2xl text-zinc-400">Meet the sharpest desk detectives.</p></div><Card><CardHeader><CardTitle className="text-3xl">Final leaderboard</CardTitle></CardHeader><CardContent><Leaderboard entries={state.leaderboard} large /></CardContent></Card></div>
        )}

        {!isLobby && !isFinished && round && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Card className="overflow-hidden"><div className="relative flex h-[64vh] items-center justify-center bg-black"><img key={`${round.id}-${round.status}`} src={apiAssetUrl(round.imageUrl)} alt="Mystery workstation" className="max-h-full max-w-full object-contain" /><Badge className="absolute left-5 top-5 px-4 py-2 text-base">Round {round.position} / {state.game.roundCount}</Badge></div><CardContent className="pt-6">{round.status === "Open" ? <><Timer remaining={remaining} duration={round.durationSeconds} /><div className="mt-5 flex items-center justify-between"><h2 className="text-3xl font-black">Whose workstation is this?</h2><p className="text-lg text-zinc-400">{round.answerCount} answered</p></div></> : <div className="text-center"><p className="font-semibold uppercase tracking-[0.2em] text-emerald-300">The desk belongs to</p><h2 className="mt-2 text-5xl font-black">{round.correctAnswer}</h2>{round.funFact && <p className="mt-3 text-xl text-zinc-400">{round.funFact}</p>}</div>}</CardContent></Card>
            <Card className="h-fit"><CardHeader><CardTitle className="text-2xl">Leaderboard</CardTitle></CardHeader><CardContent><Leaderboard entries={state.leaderboard.slice(0, 8)} large /></CardContent></Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}
