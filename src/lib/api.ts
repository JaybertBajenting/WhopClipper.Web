import type { HostGame, HostGameSummary, PlayerSession, PublicGameState } from "@/lib/types"

export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5087").replace(/\/$/, "")

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}, hostKey?: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json")
  if (hostKey) headers.set("X-Host-Key", hostKey)

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { message?: string; detail?: string }
      message = body.message || body.detail || message
    } catch {
      // Keep the status-based fallback for non-JSON errors.
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  joinGame: (code: string, displayName: string) =>
    request<PlayerSession>(`/api/games/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ displayName }),
    }),
  gameState: (code: string, session?: PlayerSession) => {
    const query = session
      ? `?playerId=${encodeURIComponent(session.playerId)}&playerToken=${encodeURIComponent(session.playerToken)}`
      : ""
    return request<PublicGameState>(`/api/games/${encodeURIComponent(code)}/state${query}`)
  },
  submitAnswer: (code: string, session: PlayerSession, roundId: string, guess: string) =>
    request<{ accepted: boolean; submittedAt: string }>(`/api/games/${encodeURIComponent(code)}/answers`, {
      method: "POST",
      body: JSON.stringify({
        playerId: session.playerId,
        playerToken: session.playerToken,
        roundId,
        guess,
      }),
    }),
  verifyHost: (hostKey: string) => request<{ authenticated: boolean }>("/api/host/verify", {}, hostKey),
  hostGames: (hostKey: string) => request<HostGameSummary[]>("/api/host/games", {}, hostKey),
  createGame: (hostKey: string, title: string) =>
    request<{ id: string; code: string; title: string }>("/api/host/games", {
      method: "POST",
      body: JSON.stringify({ title }),
    }, hostKey),
  hostGame: (hostKey: string, gameId: string) =>
    request<HostGame>(`/api/host/games/${gameId}`, {}, hostKey),
  uploadImage: (hostKey: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<{ imagePath: string }>("/api/host/storage/images", { method: "POST", body: form }, hostKey)
  },
  createRound: (hostKey: string, gameId: string, body: object) =>
    request<{ id: string; position: number }>(`/api/host/games/${gameId}/rounds`, {
      method: "POST",
      body: JSON.stringify(body),
    }, hostKey),
  deleteRound: (hostKey: string, gameId: string, roundId: string) =>
    request<void>(`/api/host/games/${gameId}/rounds/${roundId}`, { method: "DELETE" }, hostKey),
  startGame: (hostKey: string, gameId: string) =>
    request<void>(`/api/host/games/${gameId}/start`, { method: "POST" }, hostKey),
  pauseGame: (hostKey: string, gameId: string) =>
    request<void>(`/api/host/games/${gameId}/pause`, { method: "POST" }, hostKey),
  resumeGame: (hostKey: string, gameId: string) =>
    request<void>(`/api/host/games/${gameId}/resume`, { method: "POST" }, hostKey),
  skipPhase: (hostKey: string, gameId: string) =>
    request<void>(`/api/host/games/${gameId}/skip`, { method: "POST" }, hostKey),
  endGame: (hostKey: string, gameId: string) =>
    request<void>(`/api/host/games/${gameId}/end`, { method: "POST" }, hostKey),
}

export function apiAssetUrl(path: string) {
  return path.startsWith("http") ? path : `${API_BASE}${path}`
}

export function playerSessionKey(code: string) {
  return `desk-detective-player:${code.toUpperCase()}`
}

export const hostKeyStorage = "desk-detective-host-key"
