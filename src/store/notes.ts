import { create } from 'zustand'
import { api } from '../api/client'
import { showError } from './ui'

// The plain notes box of single mode, saved a moment after typing stops.
let saveTimer: number | undefined

interface NotesStore {
  text: string
  saved: boolean
  load: () => Promise<void>
  reset: () => void
  edit: (text: string) => void
  save: () => Promise<void>
}

export const useNotes = create<NotesStore>((set, get) => ({
  text: '',
  saved: true,

  load: async () => {
    try {
      set({ text: (await api.notes()).text, saved: true })
    } catch (error) {
      showError(error)
    }
  },

  reset: () => {
    clearTimeout(saveTimer)
    set({ text: '', saved: true })
  },

  edit: (text) => {
    set({ text, saved: false })
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void get().save(), 800)
  },

  save: async () => {
    clearTimeout(saveTimer)
    if (get().saved) return
    const text = get().text
    try {
      await api.saveNotes(text)
      if (get().text === text) set({ saved: true })
    } catch (error) {
      showError(error)
    }
  },
}))
