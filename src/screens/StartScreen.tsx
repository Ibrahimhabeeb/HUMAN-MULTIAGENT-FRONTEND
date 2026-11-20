import { useState } from 'react'
import { api } from '../api/client'
import type { StudyState, TaskId } from '../api/types'
import { Codicon } from '../components/Icons'
import { ModeSwitch } from '../components/ModeSwitch'
import { TaskPicker } from '../components/TaskPicker'
import { MODE_NAMES } from '../lib/agents'
import { useStudy } from '../store/study'
import { StudyPage } from './StudyPage'

// Researcher: nothing is stored until the participant agrees on the consent screen.
export function StartScreen({ state }: { state: StudyState }) {
  const busy = useStudy((s) => s.busy)
  const [taskId, setTaskId] = useState<TaskId | ''>('')
  const start = () => {
    if (taskId) return useStudy.getState().run(() => api.start(false, taskId))
  }

  return (
    <StudyPage title="Secure Coding Room" restart={false}>
      <p className="lead study-intro">Human-Multi-Agent Teaming for Secure Software Development</p>
      <section className="session-setup" aria-labelledby="session-setup-title">
        <div className="setup-heading">
          <h2 id="session-setup-title">Session setup</h2>
          <span>Researcher</span>
        </div>
        <div className="session-fields">
          <div className="field">
            <label className="field-label" id="session-task-label" htmlFor="session-task">Task</label>
            <TaskPicker id="session-task" tasks={state.available_tasks} value={taskId} disabled={busy} onChange={setTaskId} />
          </div>
          <div className="field">
            <span className="field-label">Starting mode</span>
            <ModeSwitch />
          </div>
        </div>
        <p className="hint setup-hint">
          Starting with the {MODE_NAMES[state.mode].toLowerCase()}. Alternate the starting mode between participants.
        </p>
        <div className="study-actions">
          <button className="btn primary big" disabled={busy || !taskId} onClick={start}>
            <Codicon name={busy ? 'loading' : 'play'} className={busy ? 'codicon-modifier-spin' : ''} /> Start
          </button>
        </div>
      </section>

      <div className="study-details">
        <section>
          <h2>Your participation</h2>
          <p>Taking part is voluntary. You can stop and ask to withdraw your data at any time before submitting the final questionnaire.</p>
        </section>
        <section>
          <h2>Research team</h2>
          <p><strong>Ibrahim Habeeb-lahi Abiola</strong><br /><a href="mailto:hi261@exeter.ac.uk">hi261@exeter.ac.uk</a></p>
          <p className="hint">Supervisor: Prof. Solomon Oyelere</p>
        </section>
      </div>
    </StudyPage>
  )
}
