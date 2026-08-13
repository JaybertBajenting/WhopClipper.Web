import { useState, type FormEvent } from "react"
import { ArrowRight, Gamepad2, KeyRound, Trophy } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, playerSessionKey } from "@/lib/api"

export function HomePage() {
  const params = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState((params.code || "").toUpperCase())
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function join(event: FormEvent) {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const session = await api.joinGame(code.trim().toUpperCase(), name.trim())
      localStorage.setItem(playerSessionKey(session.gameCode), JSON.stringify(session))
      navigate(`/play/${session.gameCode}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not join the game.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-300">
            <Gamepad2 className="size-4" /> All-hands edition
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-[-0.05em] text-white sm:text-7xl">
            Whose desk<br /><span className="text-amber-300">is this?</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            Spot the clues, guess your teammate, and answer fast. The quickest detectives climb the leaderboard.
          </p>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {["100 pts for first", "One guess per round", "Fastest wins"].map((item, index) => (
              <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                <span className="mb-2 block font-mono text-xs text-amber-300">0{index + 1}</span>{item}
              </div>
            ))}
          </div>
        </div>

        <Card className="border-zinc-700/80 bg-zinc-900/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl"><Trophy className="text-amber-300" /> Join the game</CardTitle>
            <CardDescription>Enter the room code on the shared screen and the name your teammates know.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={join} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="code">Room code</Label>
                <Input id="code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC123" autoComplete="off" className="font-mono text-lg tracking-[0.3em]" required minLength={6} maxLength={6} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Jaybert" autoComplete="name" required maxLength={40} />
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={loading || code.length !== 6 || !name.trim()}>
                {loading ? "Joining…" : "Join game"} <ArrowRight />
              </Button>
            </form>
            <div className="mt-6 border-t border-zinc-800 pt-5 text-center">
              <Button asChild variant="ghost" size="sm"><Link to="/host"><KeyRound /> Host controls</Link></Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  )
}

