import { create } from 'zustand'
import { lintFile, type Diagnostic } from '../api/linting'
import type { FileMap } from '../api/types'

export interface FileDiagnostics {
  diagnostics: Diagnostic[]
  checking: boolean
  error: string | null
}

interface DiagnosticsStore {
  files: Record<string, FileDiagnostics>
  target: { path: string; row: number; column: number } | null
  sync: (files: FileMap, immediate?: boolean) => void
  reset: () => void
  navigate: (path: string, row: number, column: number) => void
}

const buffers = new Map<string, string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const requests = new Map<string, AbortController>()
let epoch = 0

function cancel(path: string) {
  clearTimeout(timers.get(path))
  timers.delete(path)
  requests.get(path)?.abort()
  requests.delete(path)
}

export const useDiagnostics = create<DiagnosticsStore>((set, get) => ({
  files: {},
  target: null,
  sync: (files, immediate = false) => {
    for (const path of buffers.keys()) {
      if (files[path]?.type !== 'file') {
        cancel(path)
        buffers.delete(path)
        const remaining = { ...get().files }
        delete remaining[path]
        set({ files: remaining, target: get().target?.path === path ? null : get().target })
      }
    }
    for (const [path, node] of Object.entries(files)) {
      if (node.type !== 'file' || !path.endsWith('.py')) continue
      if (!immediate && buffers.get(path) === node.content) continue
      cancel(path)
      buffers.set(path, node.content)
      set({ files: { ...get().files, [path]: { diagnostics: [], checking: true, error: null } } })
      const version = epoch
      const controller = new AbortController()
      requests.set(path, controller)
      const current = () => version === epoch && !controller.signal.aborted && buffers.get(path) === node.content
      const check = async () => {
        timers.delete(path)
        try {
          const result = await lintFile(path, node.content, controller.signal)
          if (current()) set({ files: { ...get().files, [path]: { diagnostics: result.diagnostics, checking: false, error: null } } })
        } catch (error) {
          if (current()) set({ files: { ...get().files, [path]: {
            diagnostics: [], checking: false, error: error instanceof Error ? error.message : String(error),
          } } })
        } finally {
          if (requests.get(path) === controller) requests.delete(path)
        }
      }
      if (immediate) void check()
      else timers.set(path, setTimeout(() => void check(), 700))
    }
  },
  reset: () => {
    epoch++
    for (const path of buffers.keys()) cancel(path)
    buffers.clear()
    set({ files: {}, target: null })
  },
  navigate: (path, row, column) => set({ target: { path, row, column } }),
}))
