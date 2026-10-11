import { useDiagnostics } from '../store/diagnostics'
import { useWorkspace } from '../store/workspace'
import { Codicon } from './Icons'
import '../styles/problems.css'

export function Problems() {
  const files = useDiagnostics((s) => s.files)
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
  const checking = entries.some(([, file]) => file.checking)
  const hasProblems = entries.some(([, file]) => file.error || file.diagnostics.length > 0)
  return (
    <div className="lint-problems">
      {checking && <div className="lint-checking" role="status"><Codicon name="loading" className="codicon-modifier-spin" /> Checking Python files...</div>}
      {!checking && !hasProblems && <div className="panel-empty">No problems found.</div>}
      {entries.map(([path, file]) => (file.error || file.diagnostics.length > 0) && (
        <div key={path}>
          <div className="problems-file"><Codicon name="file-code" /> {path}</div>
          {file.error && <div className="lint-unavailable" role="alert"><Codicon name="warning" /> {file.error}</div>}
          {file.diagnostics.map((issue, index) => (
            <button className="lint-problem" key={`${issue.code}:${index}`} title={`${path}:${issue.location.row}:${issue.location.column}`} onClick={() => {
              useWorkspace.getState().open(path)
              useDiagnostics.getState().navigate(path, issue.location.row, issue.location.column)
            }}>
              <Codicon name={issue.severity === 'error' ? 'error' : 'warning'} className={`lint-${issue.severity}`} />
              <span className="lint-message">{issue.message} <span className="lint-rule">{issue.code}</span></span>
              <span className="lint-position">{issue.location.row}:{issue.location.column}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
