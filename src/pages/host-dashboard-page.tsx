import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ArrowRight, LogOut, Plus, Users } from "lucide-react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, hostKeyStorage } from "@/lib/api"
import type { HostGameSummary } from "@/lib/types"

export function HostDashboardPage() {
  const navigate = useNavigate()
  const hostKey = sessionStorage.getItem(hostKeyStorage)
  const [games, setGames] = useState<HostGameSummary[]>([])
  const [title, setTitle] = useState("All-Hands Desk Detective")
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    if (!hostKey) return
    try { setGames(await api.hostGames(hostKey)); setError("") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load games.") }
  }, [hostKey])
  useEffect(() => {
    const initial = window.setTimeout(refresh, 0)
    return () => window.clearTimeout(initial)
  }, [refresh])

  if (!hostKey) return <Navigate to="/host" replace />

  async function create(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      const game = await api.createGame(hostKey!, title)
      navigate(`/host/games/${game.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the game.")
    } finally { setCreating(false) }
  }

  function logOut() {
    sessionStorage.removeItem(hostKeyStorage)
    navigate("/host")
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between"><div><p className="text-sm text-amber-300">Host area</p><h1 className="text-3xl font-black">Your games</h1></div><Button variant="ghost" onClick={logOut}><LogOut /> Lock host controls</Button></div>
        {error && <p className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card className="h-fit"><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="text-amber-300" /> New game</CardTitle><CardDescription>Create a room first, then add workstation rounds.</CardDescription></CardHeader><CardContent><form onSubmit={create} className="space-y-4"><div className="space-y-2"><Label htmlFor="title">Meeting title</Label><Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></div><Button className="w-full" disabled={creating}>{creating ? "Creating…" : "Create game"}</Button></form></CardContent></Card>
          <div className="space-y-3">
            {games.length === 0 ? <Card><CardContent className="py-16 text-center text-zinc-500">No games yet. Create the first one.</CardContent></Card> : games.map((game) => (
              <Link key={game.id} to={`/host/games/${game.id}`} className="block"><Card className="transition hover:border-zinc-600 hover:bg-zinc-900"><CardContent className="flex items-center gap-4 p-5"><div className="grid size-14 shrink-0 place-items-center rounded-xl bg-zinc-800 font-mono font-black text-amber-300">{game.code}</div><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{game.title}</h2><div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary"><Users /> {game.playerCount}</Badge><Badge variant="secondary">{game.roundCount} rounds</Badge><Badge variant={game.status === "Finished" ? "success" : "default"}>{game.status}</Badge></div></div><ArrowRight className="text-zinc-600" /></CardContent></Card></Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
