import { useState } from 'react'
import { api } from '../api/client'
import type { StudyState, TaskId } from '../api/types'
import { Codicon } from '../components/Icons'
import { ModeSwitch } from '../components/ModeSwitch'
import { MODE_NAMES } from '../lib/agents'
import { useStudy } from '../store/study'
import { StudyPage } from './StudyPage'

const TASK_ICONS: Record<TaskId, string> = {
  A: 'lock', B: 'folder-opened', C: 'comment-discussion', D: 'settings-gear', E: 'mail', F: 'file', G: 'list-unordered',
}

// Researcher: nothing is stored until the participant agrees on the consent screen.
export function StartScreen({ state }: { state: StudyState }) {
  const busy = useStudy((s) => s.busy)
  const [taskId, setTaskId] = useState<TaskId>('A')
  const start = (pilot: boolean) => useStudy.getState().run(() => api.start(pilot, taskId))

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
            <label className="field-label" htmlFor="session-task">Task</label>
            <div className={`task-picker${busy ? ' disabled' : ''}`}>
              <span className={`task-picker-icon task-${taskId.toLowerCase()}`}><Codicon name={TASK_ICONS[taskId]} /></span>
              <select className="task-select" id="session-task" value={taskId} disabled={busy} onChange={(event) => setTaskId(event.target.value as TaskId)}>
                {state.available_tasks.map((task) => <option key={task.id} value={task.id}>{task.label} ({task.cwe})</option>)}
              </select>
              <Codicon name="chevron-down" className="task-picker-arrow" />
            </div>
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
          <button className="btn primary big" disabled={busy} onClick={() => start(false)}>
            <Codicon name={busy ? 'loading' : 'person-add'} className={busy ? 'codicon-modifier-spin' : ''} /> New participant
          </button>
          <button className="btn secondary big" disabled={busy} onClick={() => start(true)}>
            <Codicon name="beaker" /> New pilot participant
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
