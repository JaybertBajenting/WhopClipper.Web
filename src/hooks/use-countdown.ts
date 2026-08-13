import { useEffect, useState } from "react"

export function useCountdown(openedAt: string | null | undefined, durationSeconds: number | undefined) {
  const calculate = () => {
    if (!openedAt || !durationSeconds) return 0
    const end = new Date(openedAt).getTime() + durationSeconds * 1000
    return Math.max(0, Math.ceil((end - Date.now()) / 1000))
  }
  const [remaining, setRemaining] = useState(calculate)

  useEffect(() => {
    const tick = () => {
      if (!openedAt || !durationSeconds) {
        setRemaining(0)
        return
      }
      const end = new Date(openedAt).getTime() + durationSeconds * 1000
      setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    }
    const initial = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 250)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [openedAt, durationSeconds])

  return remaining
}
