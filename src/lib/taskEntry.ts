import type { FileMap } from '../api/types'

// Starter functions carry this comment, so the entry point follows the actual template rather than a task-id map.
export function taskEntry(files: FileMap): { path: string; row: number } | null {
  for (const path of Object.keys(files).sort()) {
    const file = files[path]
    if (file.type !== 'file' || !path.endsWith('.py') || path.startsWith('tests/')) continue
    const lines = file.content.split(/\r?\n/)
    const marker = lines.findIndex(line => /^\s*#\s*Write your code here\b/i.test(line))
    if (marker < 0) continue
    for (let index = marker - 1; index >= 0; index--) {
      if (/^\s*(?:async\s+)?def\s+/.test(lines[index])) return { path, row: index + 1 }
    }
    return { path, row: marker + 1 }
  }
  return null
}
