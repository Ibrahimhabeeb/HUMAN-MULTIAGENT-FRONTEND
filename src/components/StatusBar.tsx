import { languageOf } from '../lib/files'
import { useAgents } from '../store/agents'
import { useTests } from '../store/tests'
import { useUi } from '../store/ui'
import { useWorkspace } from '../store/workspace'
import { Codicon } from './Icons'
import { useDiagnostics } from '../store/diagnostics'

// The blue bar along the bottom.
export function StatusBar() {
  const saving = useWorkspace((s) => s.saving)
  const unsaved = useWorkspace((s) => s.dirty.length)
  const selectedPath = useWorkspace((s) => s.selectedPath)
  const result = useTests((s) => s.result)
  const waiting = useAgents((s) => s.approvals.filter((a) => a.status === 'pending').length)
  const showRightTab = useUi((s) => s.showRightTab)
  const setBottomTab = useUi((s) => s.setBottomTab)
  const diagnostics = useDiagnostics((s) => s.files)
  const issues = Object.values(diagnostics).flatMap((file) => file.diagnostics)
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.length - errors

  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-item remote">
          <Codicon name="shield" /> Secure Coding Room
        </span>
        <span className="status-item">
          <Codicon name={saving > 0 ? 'sync' : unsaved > 0 ? 'circle-filled' : 'check'} />
          {saving > 0 ? 'Saving…' : unsaved > 0 ? 'Unsaved changes' : 'All changes saved'}
        </span>
        {result && (
          <button className="status-item" onClick={() => setBottomTab('tests')}>
            <Codicon name={result.status === 'passed' ? 'pass' : 'beaker'} /> Tests: {result.message}
          </button>
        )}
      </div>
      <div className="status-right">
        <button className="status-item" title="Problems" aria-label={`${errors} errors, ${warnings} warnings. Open Problems`} onClick={() => setBottomTab('problems')}>
          <Codicon name="error" /> {errors} <Codicon name="warning" /> {warnings}
        </button>
        {waiting > 0 && (
          <button className="status-item" onClick={() => showRightTab('chat')}>
            <Codicon name="bell-dot" /> {waiting} waiting for approval
          </button>
        )}
        {selectedPath && <span className="status-item">{languageOf(selectedPath).label}</span>}
        <span className="status-item">UTF-8</span>
      </div>
    </footer>
  )
}
