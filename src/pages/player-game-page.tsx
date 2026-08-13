import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, CircleX, LoaderCircle, Radio, Trophy, Users } from "lucide-react"
import { Navigate, useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Leaderboard } from "@/components/leaderboard"
import { Timer } from "@/components/timer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api, apiAssetUrl, playerSessionKey } from "@/lib/api"
import type { PlayerSession, PublicGameState } from "@/lib/types"
import { useCountdown } from "@/hooks/use-countdown"
import { useGameUpdates } from "@/hooks/use-game-updates"

function getSession(code: string): PlayerSession | null {
  try {
    const value = localStorage.getItem(playerSessionKey(code))
    return value ? JSON.parse(value) as PlayerSession : null
  } catch {
    return null
  }
}

export function PlayerGamePage() {
  const { code = "" } = useParams()
  const session = useMemo(() => getSession(code), [code])
  const [state, setState] = useState<PublicGameState | null>(null)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) return
    try {
      setState(await api.gameState(code, session))
      setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not refresh the game.")
    }
  }, [code, session])

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

  if (!session) return <Navigate to={`/join/${code}`} replace />
  if (!state) {
    return <AppShell><div className="grid min-h-[70vh] place-items-center"><LoaderCircle className="size-8 animate-spin text-amber-300" /><span className="sr-only">Loading game</span></div></AppShell>
  }

  async function answer(guess: string) {
    if (!state?.round || submitting) return
    setSubmitting(true)
    setError("")
    try {
      await api.submitAnswer(code, session!, state.round.id, guess)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your answer could not be submitted.")
    } finally {
      setSubmitting(false)
    }
  }

  const round = state.round
  const isLobby = state.game.status === "Lobby" && !round
  const isFinished = state.game.status === "Finished"
  const isRevealed = round?.status === "Revealed" || isFinished

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-500">{state.game.title}</p>
            <h1 className="text-2xl font-bold">Hey, {state.player?.displayName}</h1>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary"><Users /> {state.game.playerCount}</Badge>
            <Badge><Trophy /> {state.player?.totalScore ?? 0} pts</Badge>
          </div>
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}

        {isLobby && (
          <Card className="overflow-hidden text-center">
            <CardContent className="px-6 py-20">
              <Radio className="mx-auto mb-5 size-12 animate-pulse text-amber-300" />
              <h2 className="text-3xl font-bold">You’re in.</h2>
              <p className="mt-3 text-zinc-400">The host is setting up. Keep this window open—the first desk will appear automatically.</p>
            </CardContent>
          </Card>
        )}

        {isFinished && (
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
            <Card><CardContent className="py-16 text-center"><Trophy className="mx-auto mb-4 size-16 text-amber-300" /><h2 className="text-4xl font-black">Case closed!</h2><p className="mt-3 text-zinc-400">You finished with <span className="font-bold text-amber-300">{state.player?.totalScore} points</span>.</p></CardContent></Card>
            <Card><CardHeader><CardTitle>Final leaderboard</CardTitle></CardHeader><CardContent><Leaderboard entries={state.leaderboard} currentPlayerId={state.player?.id} /></CardContent></Card>
          </div>
        )}

        {!isLobby && !isFinished && round && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="overflow-hidden">
              <div className="relative aspect-[4/3] bg-black">
                <img key={`${round.id}-${round.status}`} src={apiAssetUrl(round.imageUrl)} alt="Mystery workstation" className="size-full object-contain" />
                <Badge className="absolute left-4 top-4">Round {round.position} of {state.game.roundCount}</Badge>
              </div>
              <CardContent className="space-y-5 pt-6">
                {round.status === "Open" && <Timer remaining={remaining} duration={round.durationSeconds} />}

                {round.status === "Open" && !round.ownAnswer && round.isAcceptingAnswers && remaining > 0 && (
                  <div>
                    <h2 className="mb-4 text-center text-xl font-bold">Whose workstation is this?</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {round.options.map((option) => <Button key={option} variant="outline" size="lg" disabled={submitting} onClick={() => answer(option)} className="h-auto min-h-14 whitespace-normal px-4 py-3">{option}</Button>)}
                    </div>
                  </div>
                )}

                {round.status === "Open" && round.ownAnswer && (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 text-center"><CheckCircle2 className="mx-auto mb-3 size-9 text-amber-300" /><h2 className="text-xl font-bold">Answer locked in</h2><p className="mt-2 text-zinc-400">You chose <strong className="text-zinc-200">{round.ownAnswer.guess}</strong>. Waiting for the reveal…</p></div>
                )}

                {round.status === "Open" && (!round.isAcceptingAnswers || remaining === 0) && !round.ownAnswer && (
                  <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-6 text-center"><CircleX className="mx-auto mb-3 size-9 text-zinc-500" /><h2 className="text-xl font-bold">Time’s up</h2><p className="mt-2 text-zinc-400">Waiting for the host to reveal the answer.</p></div>
                )}

                {isRevealed && (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center">
                    <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">The desk belongs to</p>
                    <h2 className="mt-2 text-4xl font-black">{round.correctAnswer}</h2>
                    {round.funFact && <p className="mx-auto mt-3 max-w-xl text-zinc-400">{round.funFact}</p>}
                    {round.ownAnswer && <p className="mt-5 font-semibold">{round.ownAnswer.isCorrect ? `Correct! +${round.ownAnswer.scoreAwarded} points` : `You guessed ${round.ownAnswer.guess}`}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="h-fit"><CardHeader><CardTitle>Leaderboard</CardTitle></CardHeader><CardContent><Leaderboard entries={state.leaderboard} currentPlayerId={state.player?.id} /></CardContent></Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}
