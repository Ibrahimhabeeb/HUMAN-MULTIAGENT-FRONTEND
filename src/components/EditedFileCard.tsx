import { useState } from 'react'
import type { Approval } from '../api/types'
import { ask } from '../store/dialog'
import { useAgents } from '../store/agents'
import { useDiagnostics } from '../store/diagnostics'
import { useWorkspace } from '../store/workspace'
import { Codicon, FileIcon } from './Icons'

type DiffLine = { kind: 'context' | 'add' | 'remove'; text: string }

function isDiffLine(value: unknown): value is DiffLine {
  if (!value || typeof value !== 'object') return false
  const line = value as Record<string, unknown>
  return ['context', 'add', 'remove'].includes(String(line.kind)) && typeof line.text === 'string'
}

function linesFor(approval: Approval): DiffLine[] {
  const recorded = approval.result?.diff
  if (Array.isArray(recorded)) return recorded.filter(isDiffLine)
  const before = String(approval.proposal.find ?? '').split(/\r?\n/)
  const after = String(approval.proposal.replace ?? '').split(/\r?\n/)
  return [
    ...before.map((text) => ({ kind: 'remove' as const, text })),
    ...after.map((text) => ({ kind: 'add' as const, text })),
  ]
}

export function EditedFileCard({ approval }: { approval: Approval }) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changingCode = useAgents((s) => s.undoing || s.messages.some((message) =>
    ['queued', 'running'].includes(message.data.status ?? '') && message.data.fix_choice === 'reviewer'))
  const path = String(approval.proposal.file ?? '')
  const diff = linesFor(approval)
  const added = Number(approval.result?.added_lines ?? diff.filter((line) => line.kind === 'add').length)
  const removed = Number(approval.result?.removed_lines ?? diff.filter((line) => line.kind === 'remove').length)
  const undone = approval.status === 'undone'
  const canUndo = typeof approval.result?.after_hash === 'string'
    && typeof approval.result?.offset === 'number' && Number.isInteger(approval.result.offset)

  function openFile() {
    useWorkspace.getState().open(path)
    useDiagnostics.getState().navigate(path, Number(approval.result?.line ?? 1), 1, false)
  }

  async function undo() {
    if (!canUndo || undone || busy || changingCode) return
    if (!(await ask('Undo Code Reviewer edit?', `Restore ${path} to its previous version and remove the recorded mitigation?`, 'Undo edit'))) return
    setBusy(true)
    setError(null)
    setError(await useAgents.getState().undoFix(approval.id))
    setBusy(false)
  }

  return (
    <section className={`card file-edit-card${undone ? ' undone' : ''}`} aria-label={`Code Reviewer edit to ${path}`}>
      <div className="file-edit-summary">
        <FileIcon path={path} />
        <div className="file-edit-description">
          <div className="file-edit-title">{undone ? 'Undid edit' : 'Edited'} <button className="file-edit-path" onClick={openFile}>{path}</button></div>
          <div className="delta"><span className="add">+{added}</span> <span className="del">-{removed}</span></div>
        </div>
        <div className="file-edit-actions">
          {undone ? <span className="file-edit-undone">Undone</span> : (
            <button className="file-edit-action" onClick={() => void undo()} disabled={!canUndo || busy || changingCode}
              title={canUndo ? 'Restore the prior code and remove this mitigation' : 'Undo is unavailable for older edits'}>
              <Codicon name={busy ? 'loading' : 'discard'} className={busy ? 'codicon-modifier-spin' : ''} /> Undo
            </button>
          )}
          <button className="file-edit-action view-changes" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            <Codicon name="diff" /> {expanded ? 'Hide changes' : 'View changes'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="file-edit-diff" aria-label={`Changes to ${path}`}>
          <div className="file-edit-diff-heading">{path}</div>
          {diff.length ? <pre>{diff.map((line, index) => (
            <span key={index} className={`file-edit-line ${line.kind}`}>
              <span className="file-edit-prefix" aria-hidden>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
              <code>{line.text || ' '}</code>
            </span>
          ))}</pre> : <p>Whitespace-only change. Open the file to inspect it.</p>}
        </div>
      )}
      {error && <div className="file-edit-error" role="alert"><Codicon name="warning" /> {error}</div>}
    </section>
  )
}
