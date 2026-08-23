import { create } from "zustand"

interface UiState {
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}))
