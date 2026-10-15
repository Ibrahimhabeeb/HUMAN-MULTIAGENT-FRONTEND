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
  reset: () => void
}

export const useTests = create<TestsStore>((set) => ({
  result: null,
  running: false,

  run: async (mode) => {
    set({ running: true })
    try {
      await useWorkspace.getState().saveAll() // the tests run on the saved files
      set({ result: await api.runTests() })
      useUi.getState().setBottomTab('tests')
      if (mode === 'team') await useSecurity.getState().load() // each security test keeps its latest result
    } catch (error) {
      showError(error)
    } finally {
      set({ running: false })
    }
  },

  reset: () => set({ result: null, running: false }),
}))
