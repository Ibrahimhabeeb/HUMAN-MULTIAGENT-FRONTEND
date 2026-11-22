import { editor, Uri } from 'monaco-editor'
import { create } from 'zustand'
import { ApiError, api } from '../api/client'
import type { FileMap } from '../api/types'
import { isInside, parentOf } from '../lib/files'
import { applyModelText } from '../monaco/modelEdits'
import { showError } from './ui'

// The participant's files. Edits are saved to the backend a moment after typing stops.
const SAVE_DELAY = 1000
const RETRY_DELAY = 3000
const saveTimers = new Map<string, number>()
let saveFailing = false // so an unreachable backend gives one message, not one per retry

interface WorkspaceStore {
  files: FileMap
  openPaths: string[]
  selectedPath: string | null
  dirty: string[]
  saving: number
  expanded: string[]
  load: () => Promise<void>
  reset: () => void
  open: (path: string) => void
  close: (path: string) => void
  edit: (path: string, content: string) => void
  save: (path: string) => Promise<void>
  saveAll: () => Promise<void>
  createFile: (path: string) => Promise<boolean>
  createFolder: (path: string) => Promise<boolean>
  rename: (from: string, to: string) => Promise<boolean>
  remove: (path: string) => Promise<void>
  toggleFolder: (path: string) => void
  expand: (path: string) => void
}

const empty = { files: {}, openPaths: [], selectedPath: null, dirty: [], saving: 0, expanded: [] }

function cancelSave(path: string) {
  clearTimeout(saveTimers.get(path))
  saveTimers.delete(path)
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  ...empty,

  load: async () => {
    try {
      const requested = get().files
      const files = await api.files()
      const { files: local, dirty, openPaths, selectedPath } = get()
      const protectedPaths = new Set(dirty)
      // A save can finish while this refresh is pending, so check changes since the request too.
      for (const path of new Set([...Object.keys(requested), ...Object.keys(local)])) {
        const before = requested[path], now = local[path]
        if (before?.type !== now?.type || now?.type === 'file' && (before?.type !== 'file' || before.content !== now.content)) {
          protectedPaths.add(path)
        }
      }
      for (const path of protectedPaths) {
        if (local[path]) files[path] = local[path]
        else delete files[path]
      }
      const stillOpen = openPaths.filter((p) => files[p]?.type === 'file')
      set({
        files,
        openPaths: stillOpen,
        selectedPath: selectedPath && stillOpen.includes(selectedPath) ? selectedPath : (stillOpen.at(-1) ?? null),
      })
      // The editor isn't driven by React (that can drop keystrokes), so changes from the server, such as an
      // approved test file or a fix the Code Reviewer wrote, go straight into its text. Files with unsaved typing
      // and files changed while this request was pending are left alone.
      for (const [path, node] of Object.entries(files)) {
        const model = node.type === 'file' && !protectedPaths.has(path) ? editor.getModel(Uri.parse(path)) : null
        if (model && node.type === 'file' && model.getValue() !== node.content) applyModelText(model, node.content)
      }
    } catch (error) {
      showError(error)
    }
  },

  reset: () => {
    saveTimers.forEach((timer) => clearTimeout(timer))
    saveTimers.clear()
    set(empty)
  },

  open: (path) => {
    const { openPaths } = get()
    set({ openPaths: openPaths.includes(path) ? openPaths : [...openPaths, path], selectedPath: path })
  },

  close: (path) => {
    if (get().dirty.includes(path)) void get().save(path)
    const remaining = get().openPaths.filter((p) => p !== path)
    set({
      openPaths: remaining,
      selectedPath: get().selectedPath === path ? (remaining.at(-1) ?? null) : get().selectedPath,
    })
  },

  edit: (path, content) => {
    const node = get().files[path]
    if (node?.type !== 'file' || node.content === content) return
    const { files, dirty } = get()
    set({ files: { ...files, [path]: { type: 'file', content } }, dirty: dirty.includes(path) ? dirty : [...dirty, path] })
    cancelSave(path)
    saveTimers.set(path, window.setTimeout(() => void get().save(path), SAVE_DELAY))
  },

  save: async (path) => {
    cancelSave(path)
    const node = get().files[path]
    if (node?.type !== 'file' || !get().dirty.includes(path)) return
    set({ saving: get().saving + 1 })
    try {
      await api.writeFile(path, node.content)
      saveFailing = false
      const now = get().files[path]
      if (now?.type === 'file' && now.content === node.content) set({ dirty: get().dirty.filter((p) => p !== path) })
    } catch (error) {
      const unreachable = error instanceof ApiError && (error.status === 0 || error.status >= 500)
      if (!unreachable || !saveFailing) showError(error)
      if (unreachable) {
        saveFailing = true
        saveTimers.set(path, window.setTimeout(() => void get().save(path), RETRY_DELAY)) // try again shortly
      }
    } finally {
      set({ saving: get().saving - 1 })
    }
  },

  saveAll: async () => {
    await Promise.all(get().dirty.map((path) => get().save(path)))
  },

  createFile: async (path) => {
    try {
      await api.writeFile(path, '')
      await get().load()
      get().expand(parentOf(path))
      get().open(path)
      return true
    } catch (error) {
      showError(error)
      return false
    }
  },

  createFolder: async (path) => {
    try {
      await api.createFolder(path)
      await get().load()
      get().expand(path)
      return true
    } catch (error) {
      showError(error)
      return false
    }
  },

  rename: async (from, to) => {
    const moved = (path: string) => (isInside(path, from) ? to + path.slice(from.length) : path)
    try {
      await Promise.all(get().dirty.filter((p) => isInside(p, from)).map((p) => get().save(p)))
      await api.rename(from, to)
      const { openPaths, selectedPath, expanded } = get()
      set({
        openPaths: openPaths.map(moved),
        selectedPath: selectedPath && moved(selectedPath),
        expanded: expanded.map(moved),
      })
      await get().load()
      return true
    } catch (error) {
      showError(error)
      return false
    }
  },

  remove: async (path) => {
    try {
      get().dirty.filter((p) => isInside(p, path)).forEach(cancelSave)
      await api.deletePath(path)
      set({ dirty: get().dirty.filter((p) => !isInside(p, path)) })
      await get().load()
    } catch (error) {
      showError(error)
    }
  },

  toggleFolder: (path) => {
    const { expanded } = get()
    set({ expanded: expanded.includes(path) ? expanded.filter((p) => p !== path) : [...expanded, path] })
  },

  expand: (path) => {
    const folders: string[] = []
    for (let p = path; p; p = parentOf(p)) folders.push(p)
    set({ expanded: [...new Set([...get().expanded, ...folders])] })
  },
}))
