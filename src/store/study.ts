import { create } from 'zustand'
import { api } from '../api/client'
import type { StudyState } from '../api/types'
import { showError } from './ui'

// The session as the backend sees it. Every study action returns the new state,
// so the screen to show always comes from the server.
interface StudyStore {
  state: StudyState | null
  busy: boolean
  refresh: () => Promise<void>
  run: (action: () => Promise<StudyState>) => Promise<boolean>
}

export const useStudy = create<StudyStore>((set) => ({
  state: null,
  busy: false,

  refresh: async () => {
    try {
      set({ state: await api.state() })
    } catch (error) {
      showError(error)
    }
  },

  run: async (action) => {
    set({ busy: true })
    try {
      set({ state: await action() })
      return true
    } catch (error) {
      showError(error)
      return false
    } finally {
      set({ busy: false })
    }
  },
}))
