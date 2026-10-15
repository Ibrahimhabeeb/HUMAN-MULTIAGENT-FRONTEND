import { api } from '../api/client'
import type { StudyState } from '../api/types'
import { Codicon } from '../components/Icons'
import { useStudy } from '../store/study'
import { StudyPage } from './StudyPage'

export function ThankYouScreen({ state }: { state: StudyState }) {
  const busy = useStudy((s) => s.busy)

  return (
    <StudyPage title="Thank you for taking part">
      <p className="lead"><Codicon name="pass" /> Your responses have been submitted.</p>
      <p className="hint">Your participant ID</p>
      <div className="participant-id">{state.participant}</div>
      <p>As explained before taking part, study data cannot be withdrawn after submission.</p>
      <div className="study-actions">
        <button className="btn primary big" disabled={busy} onClick={() => useStudy.getState().run(api.finish)}>
          Finish <Codicon name="arrow-right" />
        </button>
      </div>
    </StudyPage>
  )
}
