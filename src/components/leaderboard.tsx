import { Crown, Medal } from "lucide-react"
import type { LeaderboardEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

export function Leaderboard({ entries, currentPlayerId, large = false }: { entries: LeaderboardEntry[]; currentPlayerId?: string; large?: boolean }) {
  if (entries.length === 0) return <p className="py-8 text-center text-sm text-zinc-500">No players yet.</p>
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.playerId} className={cn("flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3", entry.playerId === currentPlayerId && "border-amber-400/40 bg-amber-400/5", large && "py-4 text-lg")}>
          <div className="grid size-8 shrink-0 place-items-center text-zinc-400">
            {entry.rank === 1 ? <Crown className="text-amber-300" /> : entry.rank <= 3 ? <Medal className={entry.rank === 2 ? "text-zinc-300" : "text-amber-700"} /> : <span className="text-sm font-bold">{entry.rank}</span>}
          </div>
          <span className="min-w-0 flex-1 truncate font-medium">{entry.displayName}</span>
          <span className="font-mono font-bold text-amber-300">{entry.totalScore}</span>
        </div>
      ))}
    </div>
  )
}

