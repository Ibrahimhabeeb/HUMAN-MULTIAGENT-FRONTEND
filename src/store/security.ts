import { create } from 'zustand'
import { api } from '../api/client'
import type { HumanAddCategory, HumanCategory, Proposal, SecurityState } from '../api/types'
import { showError } from './ui'

// The shared security state (team mode). The developer may add findings and mitigations and edit existing entries.
interface SecurityStore {
  state: SecurityState | null
  load: () => Promise<void>
  reset: () => void
  add: (category: HumanAddCategory, body: Proposal) => Promise<string | null>
  edit: (category: HumanCategory, id: string, changes: Proposal) => Promise<string | null>
  remove: (category: HumanCategory, id: string) => Promise<void>
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const useSecurity = create<SecurityStore>((set, get) => ({
  state: null,

  load: async () => {
    try {
      set({ state: await api.securityState() })
    } catch (error) {
      showError(error)
    }
  },

  reset: () => set({ state: null }),

  add: async (category, body) => {
    try {
      await api.addItem(category, body)
      await get().load()
      return null
    } catch (error) {
      return message(error)
    }
  },

  edit: async (category, id, changes) => {
    try {
      await api.editItem(category, id, changes)
      await get().load()
      return null
    } catch (error) {
      return message(error)
    }
  },

  remove: async (category, id) => {
    try {
      await api.deleteItem(category, id)
      await get().load()
    } catch (error) {
      showError(error)
    }
  },
}))
