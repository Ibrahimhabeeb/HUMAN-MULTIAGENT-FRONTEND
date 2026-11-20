import { useEffect } from 'react'
import type { StudyState } from './api/types'
import { Dialog } from './components/Dialog'
import { Toasts } from './components/Toasts'
import { Workbench } from './components/Workbench'
import { ConsentScreen } from './screens/ConsentScreen'
import { InformationScreen } from './screens/InformationScreen'
import { PartCompleteScreen } from './screens/PartCompleteScreen'
import { QuestionnaireScreen } from './screens/QuestionnaireScreen'
import { StartScreen } from './screens/StartScreen'
import { StudyPage } from './screens/StudyPage'
import { ThankYouScreen } from './screens/ThankYouScreen'
import { useStudy } from './store/study'

// The backend decides which screen to show (GET /study/state), so a page refresh never loses the session.
function Screen({ state }: { state: StudyState }) {
  switch (state.screen) {
    case 'start':
      return <StartScreen state={state} />
    case 'information':
      return <InformationScreen />
    case 'consent':
      return <ConsentScreen />
    case 'ide':
      return <Workbench state={state} />
    case 'part_complete':
      return <PartCompleteScreen state={state} />
    case 'questionnaire':
      return <QuestionnaireScreen />
    case 'thank_you':
      return <ThankYouScreen state={state} />
  }
}

export default function App() {
  const state = useStudy((s) => s.state)

  useEffect(() => {
    void useStudy.getState().refresh()
  }, [])

  return (
    <div className={state?.screen === 'ide' ? 'app-shell' : 'app-shell study-theme'}>
      {state ? (
        <Screen state={state} />
      ) : (
        <StudyPage title="Connecting…" restart={false}>
          <p className="hint">Connecting to the study service.</p>
          <div className="study-actions">
            <button className="btn secondary" onClick={() => void useStudy.getState().refresh()}>
              Try again
            </button>
          </div>
        </StudyPage>
      )}
      <Dialog />
      <Toasts />
    </div>
  )
}
