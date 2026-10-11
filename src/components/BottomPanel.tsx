import { useState } from 'react'
import type { CaseResult, Mode, Outcome, RunResult } from '../api/types'
import { useTests } from '../store/tests'
import { useUi, type BottomTab } from '../store/ui'
import { Codicon } from './Icons'
import { useDiagnostics } from '../store/diagnostics'
import { useWorkspace } from '../store/workspace'
import { Problems } from './Problems'

// The tabs: [id, label]. The id is what's stored; the label is what's shown.
const TABS: Array<[BottomTab, string]> = [
  ['problems', 'Problems'],
  ['tests', 'Test results'],
  ['output', 'Output'],
]

const OUTCOME_ICONS: Record<Outcome, string> = { passed: 'pass', failed: 'error', error: 'warning', skipped: 'circle-slash' }
const STATUS_ICONS: Record<RunResult['status'], string> = {
  passed: 'pass',
  failed: 'error',
  no_tests: 'info',
  timed_out: 'clock',
  error: 'warning',
}

function CaseRow({ result }: { result: CaseResult }) {
  const [open, setOpen] = useState(false)
  const hasDetails = Boolean(result.message || result.details)
  return (
    <>
      <div className={`problem-row test-row ${result.outcome}`} onClick={() => hasDetails && setOpen(!open)}>
        {hasDetails ? <Codicon name={open ? 'chevron-down' : 'chevron-right'} /> : <span className="test-twistie" />}
        <Codicon name={OUTCOME_ICONS[result.outcome]} className={`outcome-${result.outcome}`} />
        <span className="problem-text">{result.name}</span>
        {result.message && <span className="problem-meta">{result.message}</span>}
      </div>
      {open && <pre className="test-details">{result.details ?? result.message}</pre>}
    </>
  )
}

function TestResults({ result }: { result: RunResult | null }) {
  if (!result) return <div className="panel-empty">Click Run tests to run the project's tests.</div>

  const files = [...new Set(result.tests.map((t) => t.file))]
  return (
    <div className="problems">
      <div className={`test-summary ${result.status}`}>
        <Codicon name={STATUS_ICONS[result.status]} /> {result.message}
      </div>
      {files.map((file) => (
        <div key={file}>
          <div className="problems-file">
            <Codicon name="file" /> {file}
          </div>
          {result.tests
            .filter((t) => t.file === file)
            .map((t) => (
              <CaseRow key={`${t.file}::${t.name}`} result={t} />
            ))}
        </div>
      ))}
    </div>
  )
}

// The panel under the editor: the results of Run tests.
export function BottomPanel({ mode }: { mode: Mode }) {
  // Which tab is active lives in the store, because Run tests also switches to it.
  const bottomTab = useUi((s) => s.bottomTab)
  const setBottomTab = useUi((s) => s.setBottomTab)
  const togglePanel = useUi((s) => s.togglePanel)
  const result = useTests((s) => s.result)
  const running = useTests((s) => s.running)
  const diagnostics = useDiagnostics((s) => s.files)
  const problemCount = Object.values(diagnostics).reduce((count, file) => count + file.diagnostics.length, 0)
  const checking = Object.values(diagnostics).some((file) => file.checking)

  return (
    <div className="bottom-panel">
      <div className="panel-header">
        <div className="panel-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={id === bottomTab ? 'panel-tab active' : 'panel-tab'} onClick={() => setBottomTab(id)}>
              {label}
              {id === 'problems' && problemCount > 0 && <span className="lint-count">{problemCount}</span>}
            </button>
          ))}
        </div>
        <div className="panel-actions">
          {bottomTab === 'problems' && <button className="icon-btn" title="Check Python files" aria-label="Check Python files" disabled={checking} onClick={() => useDiagnostics.getState().sync(useWorkspace.getState().files, true)}>
            <Codicon name={checking ? 'loading' : 'refresh'} className={checking ? 'codicon-modifier-spin' : ''} />
          </button>}
          <button className="icon-btn run" title="Run tests" disabled={running} onClick={() => useTests.getState().run(mode)}>
            <Codicon name={running ? 'loading' : 'play'} className={running ? 'codicon-modifier-spin' : ''} />
          </button>
          <button className="icon-btn" title="Close Panel (Ctrl+J)" onClick={() => togglePanel(false)}>
            <Codicon name="close" />
          </button>
        </div>
      </div>

      <div className="panel-body">
        {bottomTab === 'problems' ? <Problems /> : bottomTab === 'tests' ? (
          <TestResults result={result} />
        ) : (
          <pre className="test-output">{result?.output || 'No output yet.'}</pre>
        )}
      </div>
    </div>
  )
}
