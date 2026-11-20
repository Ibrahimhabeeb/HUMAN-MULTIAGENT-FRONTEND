import { useState } from 'react'
import { api } from '../api/client'
import type { StudyState, TaskId } from '../api/types'
import { Codicon } from '../components/Icons'
import { TaskPicker } from '../components/TaskPicker'
import { MODE_NAMES } from '../lib/agents'
import { useStudy } from '../store/study'
import { StudyPage } from './StudyPage'

export function PartCompleteScreen({ state }: { state: StudyState }) {
  const busy = useStudy((s) => s.busy)
  const nextMode = state.mode === 'team' ? 'single' : 'team'
  const [taskId, setTaskId] = useState<TaskId | ''>('')
  return (
    <StudyPage title={`Part ${state.part} is finished`}>
      <p className="lead">Next: {MODE_NAMES[nextMode]}</p>
      <p>{state.needs_next_task
        ? 'Your first part is saved and closed. Choose a different task for Part 2.'
        : 'Your first part is saved and closed. Continue to Part 2.'}</p>
      {state.needs_next_task && (
        <div className="session-fields handoff-fields">
          <div className="field">
            <label className="field-label" id="next-task-label" htmlFor="next-task">Part 2 task</label>
            <TaskPicker id="next-task" tasks={state.available_tasks} value={taskId} disabled={busy} onChange={setTaskId} />
          </div>
        </div>
      )}
      <div className="study-actions">
        <button className="btn primary big" disabled={busy || (state.needs_next_task && !taskId)} onClick={() => useStudy.getState().run(() => state.needs_next_task ? api.startPartTwo(taskId as TaskId) : api.setMode(nextMode))}>
          <Codicon name="arrow-right" /> Start Part 2 with {MODE_NAMES[nextMode]}
        </button>
      </div>
    </StudyPage>
  )
}
