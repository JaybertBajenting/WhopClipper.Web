import { useEffect } from "react"
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr"
import { API_BASE } from "@/lib/api"

export function useGameUpdates(code: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!code) return
    let stopped = false
    const connection = new HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/game`)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on("game-updated", onUpdate)
    connection.onreconnected(() => connection.invoke("SubscribeGame", code))
    connection.start()
      .then(() => connection.invoke("SubscribeGame", code))
      .catch(() => undefined)

    return () => {
      stopped = true
      void connection.stop()
      if (stopped) connection.off("game-updated", onUpdate)
    }
  }, [code, onUpdate])
}

