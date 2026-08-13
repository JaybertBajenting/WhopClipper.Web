export type GameStatus = "Lobby" | "Live" | "Paused" | "Finished"
export type RoundStatus = "Pending" | "Open" | "Revealed"

export interface LeaderboardEntry {
  rank: number
  playerId: string
  displayName: string
  totalScore: number
}

export interface PublicGameState {
  game: {
    id: string
    code: string
    title: string
    status: GameStatus
    revealDurationSeconds: number
    pausedAt: string | null
    playerCount: number
    roundCount: number
  }
  player: null | {
    id: string
    displayName: string
    totalScore: number
  }
  round: null | {
    id: string
    position: number
    status: RoundStatus
    durationSeconds: number
    openedAt: string | null
    revealedAt: string | null
    secondsRemaining: number
    isAcceptingAnswers: boolean
    imageUrl: string
    options: string[]
    correctAnswer: string | null
    funFact: string | null
    answerCount: number
    ownAnswer: null | {
      guess: string
      isCorrect: boolean | null
      scoreAwarded: number | null
      correctRank: number | null
    }
  }
  leaderboard: LeaderboardEntry[]
}

export interface PlayerSession {
  playerId: string
  playerToken: string
  gameCode: string
  displayName: string
}

export interface HostGameSummary {
  id: string
  code: string
  title: string
  status: GameStatus
  createdAt: string
  playerCount: number
  roundCount: number
}

export interface HostGame {
  id: string
  code: string
  title: string
  status: GameStatus
  revealDurationSeconds: number
  pausedAt: string | null
  createdAt: string
  players: Array<{ rank: number; id: string; displayName: string; totalScore: number; joinedAt: string }>
  rounds: Array<{
    id: string
    position: number
    correctAnswer: string
    funFact: string | null
    imagePath: string | null
    externalImageUrl: string | null
    durationSeconds: number
    status: RoundStatus
    openedAt: string | null
    revealedAt: string | null
    options: string[]
    answerCount: number
    correctCount: number
  }>
}
