import { useState, type FormEvent } from "react"
import { KeyRound, ShieldCheck } from "lucide-react"
import { Navigate, useNavigate } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, hostKeyStorage } from "@/lib/api"

export function HostLoginPage() {
  const navigate = useNavigate()
  const [key, setKey] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const existingKey = sessionStorage.getItem(hostKeyStorage)
  if (existingKey) return <Navigate to="/host/games" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      await api.verifyHost(key)
      sessionStorage.setItem(hostKeyStorage, key)
      navigate("/host/games")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Host key was rejected.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-md place-items-center px-4 py-12">
        <Card className="w-full">
          <CardHeader><div className="mb-3 grid size-12 place-items-center rounded-xl bg-amber-400 text-zinc-950"><KeyRound /></div><CardTitle>Host controls</CardTitle><CardDescription>Enter the host key configured on the backend. It stays in this browser tab only.</CardDescription></CardHeader>
          <CardContent><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="host-key">Host key</Label><Input id="host-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" required /></div>{error && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}<Button className="w-full" size="lg" disabled={loading || !key}>{loading ? "Checking…" : "Continue"} <ShieldCheck /></Button></form></CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

