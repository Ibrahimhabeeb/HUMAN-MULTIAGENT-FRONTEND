import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ConsentContent } from '../api/types'
import { Markdown } from '../components/Markdown'
import { Codicon } from '../components/Icons'
import { useStudy } from '../store/study'
import { showError } from '../store/ui'
import { StudyPage } from './StudyPage'

const NUMBERED = /^\s*\d+\.\s+/

// Each statement gets a checkbox; "I agree" only works once every box is ticked.
export function ConsentScreen() {
  const [content, setContent] = useState<ConsentContent | null>(null)
  const [ticked, setTicked] = useState<boolean[]>([])
  const busy = useStudy((s) => s.busy)

  useEffect(() => {
    api
      .consentForm()
      .then((form) => {
        setContent(form)
        setTicked(form.statements.map(() => false))
      })
      .catch(showError)
  }, [])

  const intro = content?.markdown
    .split('\n')
    .filter((line) => !NUMBERED.test(line))
    .join('\n')
  const allTicked = ticked.length > 0 && ticked.every(Boolean)
  const confirmed = ticked.filter(Boolean).length

  return (
    <StudyPage>
      {content ? (
        <>
          <div className="study-document-meta"><span><Codicon name="checklist" /> Your agreement to take part</span><span>{content.version}</span></div>
          <Markdown text={intro ?? ''} />
          <div className="consent-progress">
            <span role="status" aria-live="polite">{confirmed} of {ticked.length} statements confirmed</span>
            <progress aria-label="Consent statements completed" value={confirmed} max={ticked.length} />
          </div>
          <ul className="consent-list">
            {content.statements.map((statement, i) => (
              <li key={statement} className={ticked[i] ? 'confirmed' : ''}>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={ticked[i] ?? false}
                    onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))}
                  />
                  <span>{statement}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="study-actions consent-actions">
            <button
              className="btn primary big"
              disabled={!allTicked || busy}
              onClick={() => useStudy.getState().run(() => api.consent(content.version))}
            >
              <Codicon name="check" /> I agree
            </button>
            <button className="btn secondary big" disabled={busy} onClick={() => useStudy.getState().run(api.decline)}>
              <Codicon name="close" /> I don't want to take part
            </button>
          </div>
        </>
      ) : (
        <p className="hint" role="status">Loading consent form...</p>
      )}
    </StudyPage>
  )
}
