import { api } from '../api/client'
import type { StudyState } from '../api/types'
import { Codicon } from '../components/Icons'
import { MODE_NAMES } from '../lib/agents'
import { useStudy } from '../store/study'
import { StudyPage } from './StudyPage'

export function PartCompleteScreen({ state }: { state: StudyState }) {
  const busy = useStudy((s) => s.busy)
  const nextMode = state.mode === 'team' ? 'single' : 'team'
  const nextPart = state.parts.find((part) => part.mode === nextMode)
  const taskLabel = nextPart?.task_label ?? state.task?.label
  return (
    <StudyPage title={`Part ${state.part} is finished`}>
      <p className="lead">Next: {MODE_NAMES[nextMode]}{taskLabel ? ` - ${taskLabel}` : ''}</p>
      <div className="study-actions">
        <button className="btn primary big" disabled={busy} onClick={() => useStudy.getState().run(() => api.setMode(nextMode))}>
          <Codicon name="arrow-right" /> Continue with {MODE_NAMES[nextMode]}
        </button>
      </div>
    </StudyPage>
  )
}
