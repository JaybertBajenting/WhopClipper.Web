import { Clock3 } from "lucide-react"
import { Progress } from "@/components/ui/progress"

export function Timer({ remaining, duration }: { remaining: number; duration: number }) {
  const value = duration ? (remaining / duration) * 100 : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-zinc-400"><Clock3 className="size-4" /> Time remaining</span>
        <span className={remaining <= 5 ? "font-mono font-bold text-red-400" : "font-mono font-bold text-amber-300"}>{remaining}s</span>
      </div>
      <Progress value={value} className={remaining <= 5 ? "[&>div]:bg-red-400" : ""} />
    </div>
  )
}

