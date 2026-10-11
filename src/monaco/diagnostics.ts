import { editor, MarkerSeverity, Uri } from 'monaco-editor'
import { useDiagnostics } from '../store/diagnostics'
import { useWorkspace } from '../store/workspace'

const OWNER = 'ruff'

function updateMarkers() {
  const byUri = new Map(Object.entries(useDiagnostics.getState().files).map(([path, file]) => [Uri.parse(path).toString(), file]))
  for (const model of editor.getModels()) {
    const issues = byUri.get(model.uri.toString())?.diagnostics ?? []
    editor.setModelMarkers(model, OWNER, issues.map((issue) => ({
      message: issue.message,
      code: issue.code,
      source: 'Ruff',
      severity: issue.severity === 'error' ? MarkerSeverity.Error : MarkerSeverity.Warning,
      startLineNumber: issue.location.row,
      startColumn: issue.location.column,
      endLineNumber: Math.max(issue.location.row, issue.end_location.row),
      endColumn: issue.end_location.row === issue.location.row
        ? Math.max(issue.location.column + 1, issue.end_location.column) : issue.end_location.column,
    })))
  }
}

export function watchDiagnostics() {
  useDiagnostics.getState().sync(useWorkspace.getState().files)
  const workspaceSubscription = useWorkspace.subscribe((state) => useDiagnostics.getState().sync(state.files))
  const diagnosticsSubscription = useDiagnostics.subscribe(updateMarkers)
  const modelSubscription = editor.onDidCreateModel(updateMarkers)
  updateMarkers()
  return () => {
    workspaceSubscription()
    diagnosticsSubscription()
    modelSubscription.dispose()
    useDiagnostics.getState().reset()
    for (const model of editor.getModels()) editor.setModelMarkers(model, OWNER, [])
  }
}
