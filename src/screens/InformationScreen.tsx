import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { InformationContent } from '../api/types'
import { Markdown } from '../components/Markdown'
import { Codicon } from '../components/Icons'
import { useStudy } from '../store/study'
import { showError } from '../store/ui'
import { StudyPage } from './StudyPage'

export function InformationScreen() {
  const [content, setContent] = useState<InformationContent | null>(null)
  const busy = useStudy((s) => s.busy)

  useEffect(() => {
    api.information().then(setContent).catch(showError)
  }, [])

  return (
    <StudyPage>
      {content ? (
        <article className="study-document">
          <div className="study-document-meta"><span><Codicon name="book" /> Before you take part</span><span>{content.version}</span></div>
          <Markdown text={content.markdown} />
        </article>
      ) : <p className="hint" role="status">Loading information sheet...</p>}
      <div className="study-actions document-actions">
        <button
          className="btn primary big"
          disabled={!content || busy}
          onClick={() => useStudy.getState().run(api.continueToConsent)}
        >
          Continue <Codicon name="arrow-right" />
        </button>
      </div>
    </StudyPage>
  )
}
