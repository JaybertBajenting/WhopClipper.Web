import { Route, Routes } from "react-router-dom"
import { HomePage } from "@/pages/home-page"
import { HostDashboardPage } from "@/pages/host-dashboard-page"
import { HostGamePage } from "@/pages/host-game-page"
import { HostLoginPage } from "@/pages/host-login-page"
import { PlayerGamePage } from "@/pages/player-game-page"
import { PresentationPage } from "@/pages/presentation-page"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/join/:code" element={<HomePage />} />
      <Route path="/play/:code" element={<PlayerGamePage />} />
      <Route path="/present/:code" element={<PresentationPage />} />
      <Route path="/host" element={<HostLoginPage />} />
      <Route path="/host/games" element={<HostDashboardPage />} />
      <Route path="/host/games/:gameId" element={<HostGamePage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}

