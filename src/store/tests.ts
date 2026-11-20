import { create } from 'zustand'
import { api } from '../api/client'
import type { Mode, RunResult } from '../api/types'
import { useSecurity } from './security'
import { showError, useUi } from './ui'
import { useWorkspace } from './workspace'

interface TestsStore {
  result: RunResult | null
  running: boolean
  run: (mode: Mode) => Promise<void>
  show: (result: RunResult) => void
  reset: () => void
}

export const useTests = create<TestsStore>((set, get) => ({
  result: null,
  running: false,

  run: async (mode) => {
    set({ running: true })
    try {
      await useWorkspace.getState().saveAll() // the tests run on the saved files
      get().show(await api.runTests())
      if (mode === 'team') await useSecurity.getState().load() // each unit test keeps its latest result
    } catch (error) {
      showError(error)
    } finally {
      set({ running: false })
    }
  },

  show: (result) => {
    set({ result })
    useUi.getState().setBottomTab('tests')
  },

  reset: () => set({ result: null, running: false }),
}))
