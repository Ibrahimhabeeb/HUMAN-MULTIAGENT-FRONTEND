import { diffChars } from 'diff'

export interface TextEdit { start: number; end: number; text: string }

export function textEdits(before: string, after: string): TextEdit[] {
  if (before === after) return []
  const parts = diffChars(before, after, { timeout: 50, maxEditLength: 5000 })
  if (!parts) {
    // Large rewrites still finish promptly. Selections inside this span are cleared.
    let start = 0
    while (start < before.length && start < after.length && before[start] === after[start]) start++
    let end = 0
    while (end < before.length - start && end < after.length - start && before.at(-1 - end) === after.at(-1 - end)) end++
    return [{ start, end: before.length - end, text: after.slice(start, after.length - end) }]
  }
  const edits: TextEdit[] = []
  let offset = 0
  let pending: TextEdit | null = null
  for (const part of parts) {
    if (!part.added && !part.removed) {
      if (pending) edits.push(pending)
      pending = null
      offset += part.value.length
    } else {
      pending ??= { start: offset, end: offset, text: '' }
      if (part.removed) {
        offset += part.value.length
        pending.end = offset
      } else pending.text += part.value
    }
  }
  if (pending) edits.push(pending)
  return edits
}

export function mapOffset(offset: number, edits: TextEdit[], afterInsertion: boolean): number {
  let delta = 0
  for (const edit of edits) {
    if (offset < edit.start || (offset === edit.start && !afterInsertion)) break
    if (offset < edit.end || (offset === edit.start && offset === edit.end)) {
      return edit.start + delta + (afterInsertion ? edit.text.length : 0)
    }
    delta += edit.text.length - (edit.end - edit.start)
  }
  return offset + delta
}
