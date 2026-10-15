import type { ReactNode } from 'react'
import { Codicon } from '../components/Icons'
import { RestartButton } from '../components/RestartButton'
import { useStudy } from '../store/study'

const STEPS = ['Information', 'Consent', 'Coding sessions', 'Questionnaire']
const STEP_FOR = { start: -1, information: 0, consent: 1, ide: 2, part_complete: 2, questionnaire: 3, thank_you: 4 }

// The frame of every screen outside the IDE.
export function StudyPage({ title, restart = true, children }: { title?: string; restart?: boolean; children: ReactNode }) {
  const screen = useStudy((s) => s.state?.screen)
  const current = screen ? STEP_FOR[screen] : -1
  return (
    <div className="study-page">
      <header className="study-header">
        <div className="study-header-inner">
          <span className="study-brand">
            <span className="study-brand-mark"><Codicon name="shield" /></span>
            <span>Secure Coding Room</span>
          </span>
          {restart && <RestartButton withLabel />}
        </div>
      </header>
      <ol className="study-progress" aria-label="Study progress">
        {STEPS.map((step, i) => (
          <li key={step} className={i < current ? 'complete' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="study-step-number">{i < current ? <Codicon name="check" /> : i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <main className="study-main">
        {title && <h1>{title}</h1>}
        {children}
      </main>
      <footer className="study-footer">
        <a href="mailto:hi261@exeter.ac.uk"><Codicon name="mail" /> Contact the researcher</a>
      </footer>
    </div>
  )
}
