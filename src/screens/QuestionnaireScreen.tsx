import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { QuestionnaireForm } from '../api/types'
import { QuestionnairePager } from '../components/QuestionnairePager'
import { StudyPage } from './StudyPage'

export function QuestionnaireScreen() {
  const [form, setForm] = useState<QuestionnaireForm | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    api
      .questionnaire()
      .then(setForm)
      .catch((error) => setProblem(error instanceof Error ? error.message : String(error)))
  }, [])

  if (!form) {
    return (
      <StudyPage title="Questionnaire">
        <p className="hint">{problem ?? 'Loading…'}</p>
      </StudyPage>
    )
  }

  return (
    <StudyPage title="Questionnaire">
      <p className="lead">These questions are about the two ways of working you used. Every question is optional.</p>
      <QuestionnairePager form={form} />
    </StudyPage>
  )
}
