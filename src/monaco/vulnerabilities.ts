import { editor, Range, Uri } from 'monaco-editor'
import { useAgents } from '../store/agents'
import { useSecurity } from '../store/security'

const RED = '#f14c4c'

// Lines the Code Reviewer flagged: vulnerabilities waiting for the developer's decision, and accepted ones whose fix
// isn't implemented yet. A rejected or deleted one, or one with an implemented fix, is in neither, so its highlight goes.
function flaggedLines(): Map<string, Map<number, string[]>> {
  const byFile = new Map<string, Map<number, string[]>>()
  function flag(file: unknown, line: unknown, text: string) {
    const row = Number(line)
    if (typeof file !== 'string' || !file || !Number.isInteger(row) || row < 1) return
    const uri = Uri.parse(file.replace(/^\.\//, '')).toString()
    const lines = byFile.get(uri) ?? new Map<number, string[]>()
    lines.set(row, [...(lines.get(row) ?? []), text])
    byFile.set(uri, lines)
  }
  for (const approval of useAgents.getState().approvals) {
    if (approval.action_type !== 'propose_vulnerability' || approval.status !== 'pending') continue
    const { file, line, severity, description } = approval.proposal
    flag(file, line, `**Possible vulnerability** (${severity}), waiting for your decision: ${description}`)
  }
  const state = useSecurity.getState().state
  for (const v of state?.vulnerabilities ?? []) {
    const fixed = state?.mitigations.some((m) => m.vulnerability_id === v.id && m.status === 'implemented')
    if (v.status === 'accepted' && !fixed) flag(v.file, v.line, `**${v.id}** (${v.severity}): ${v.description}`)
  }
  return byFile
}

// Per model: its decoration ids, and the flagged lines they were made from.
const applied = new WeakMap<editor.ITextModel, { ids: string[]; signature: string }>()

function updateHighlights() {
  const byFile = flaggedLines()
  for (const model of editor.getModels()) {
    const lines = [...(byFile.get(model.uri.toString()) ?? [])].filter(([row]) => row <= model.getLineCount())
    const signature = JSON.stringify(lines)
    const previous = applied.get(model)
    // Only redraw when the flagged lines change: in between, Monaco moves each highlight as the developer edits.
    if (previous?.signature === signature) continue
    const ids = model.deltaDecorations(previous?.ids ?? [], lines.map(([row, texts]) => ({
      range: new Range(row, 1, row, 1),
      options: {
        isWholeLine: true,
        className: 'vulnerability-line',
        linesDecorationsClassName: 'vulnerability-gutter',
        hoverMessage: texts.map((value) => ({ value })),
        overviewRuler: { color: RED, position: editor.OverviewRulerLane.Left },
        minimap: { color: RED, position: editor.MinimapPosition.Inline },
        stickiness: editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    })))
    applied.set(model, { ids, signature })
  }
}

export function watchVulnerabilities() {
  const agentsSubscription = useAgents.subscribe(updateHighlights)
  const securitySubscription = useSecurity.subscribe(updateHighlights)
  const modelSubscription = editor.onDidCreateModel(updateHighlights)
  updateHighlights()
  return () => {
    agentsSubscription()
    securitySubscription()
    modelSubscription.dispose()
    for (const model of editor.getModels()) {
      const previous = applied.get(model)
      if (previous) model.deltaDecorations(previous.ids, [])
      applied.delete(model)
    }
  }
}
