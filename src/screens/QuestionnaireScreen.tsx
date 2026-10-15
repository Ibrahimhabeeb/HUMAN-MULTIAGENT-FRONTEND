import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Answer, Condition, Question, QuestionnaireForm } from '../api/types'
import { ComparisonSection } from '../components/ComparisonSection'
import { ask } from '../store/dialog'
import { useStudy } from '../store/study'
import { StudyPage } from './StudyPage'

type Value = number | string
type Answers = Record<string, Value>

const keyOf = (condition: Condition, item: string) => `${condition}|${item}`

interface InputProps {
  question: Question
  form: QuestionnaireForm
  value: Value | undefined
  onChange: (value: Value | null) => void
}

// Clicking the chosen answer again clears it, so every question can be skipped.
function QuestionInput({ question, form, value, onChange }: InputProps) {
  if (question.type === 'text') {
    return (
      <textarea
        className="answer-text"
        rows={3}
        maxLength={2000}
        placeholder={form.text_hint}
        aria-label={question.text}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  const options: Value[] =
    question.type === 'scale'
      ? Array.from({ length: form.scale.max - form.scale.min + 1 }, (_, i) => form.scale.min + i)
      : question.options
  return (
    <div className={question.type === 'scale' ? 'scale-buttons' : 'choice-buttons'}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={option === value ? 'on' : ''}
          aria-pressed={option === value}
          onClick={() => onChange(option === value ? null : option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

export function QuestionnaireScreen() {
  const [form, setForm] = useState<QuestionnaireForm | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const busy = useStudy((s) => s.busy)

  useEffect(() => {
    api
      .questionnaire()
      .then(setForm)
      .catch((error) => setProblem(error instanceof Error ? error.message : String(error)))
  }, [])

  function answer(condition: Condition, item: string, value: Value | null) {
    setAnswers((previous) => {
      const next = { ...previous }
      if (value === null || value === '') delete next[keyOf(condition, item)]
      else next[keyOf(condition, item)] = value
      return next
    })
  }

  async function submit() {
    const ok = await ask('Submit your answers?', 'After submission, you cannot change your answers or withdraw your study data. Questions you skipped stay empty.', 'Submit')
    if (!ok) return
    const list: Answer[] = Object.entries(answers).map(([key, value]) => {
      const [condition, item] = key.split('|')
      return { condition: condition as Condition, item, value }
    })
    await useStudy.getState().run(() => api.submitQuestionnaire(list))
  }

  if (!form) {
    return (
      <StudyPage title="Questionnaire">
        <p className="hint">{problem ?? 'Loading…'}</p>
      </StudyPage>
    )
  }

  const legend = `${form.scale.min} = ${form.scale.min_label}, ${form.scale.max} = ${form.scale.max_label}`

  return (
    <StudyPage title="Questionnaire">
      <p className="lead">These questions are about the two ways of working you used. Every question is optional.</p>

      {form.sections.map((section, index) => {
        const comparison = section.asked_for === 'each_mode' && section.title === 'Both ways of working'
        const hasScale = section.questions.some((q) => q.type === 'scale')
        const columns =
          section.asked_for === 'each_mode'
            ? form.modes
            : section.asked_for === 'team'
              ? form.modes.filter((m) => m.mode === 'team')
              : null
        return (
          <section key={section.title} className="questionnaire-section">
            <h2 id={`questionnaire-section-${index}`} tabIndex={-1}>{section.title}</h2>
            {section.intro && <p className="hint">{section.intro}</p>}
            {hasScale && !comparison && <p className="hint">{legend}</p>}

            {comparison ? (
              <ComparisonSection
                section={section}
                form={form}
                valueOf={(condition, item) => answers[keyOf(condition, item)]}
                onAnswer={answer}
                busy={busy}
                onContinue={() => {
                  const next = document.getElementById(`questionnaire-section-${index + 1}`)
                  next?.focus({ preventScroll: true })
                  next?.scrollIntoView({ block: 'start' })
                }}
              />
            ) : columns ? (
              <div className="rating-table-scroll" role="region" aria-label={section.title} tabIndex={0}>
                <table className="rating-table">
                  <thead>
                    <tr>
                      <th>Statement</th>
                      {columns.map((c) => (
                        <th key={c.mode}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.questions.map((q) => (
                      <tr key={q.key}>
                        <td>{q.text}</td>
                        {columns.map((c) => (
                          <td key={c.mode}>
                            <QuestionInput
                              question={q}
                              form={form}
                              value={answers[keyOf(c.mode, q.key)]}
                              onChange={(value) => answer(c.mode, q.key, value)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              section.questions.map((q) => (
                <div key={q.key} className="question">
                  <div className="question-text">{q.text}</div>
                  <QuestionInput
                    question={q}
                    form={form}
                    value={answers[keyOf('none', q.key)]}
                    onChange={(value) => answer('none', q.key, value)}
                  />
                </div>
              ))
            )}
          </section>
        )
      })}

      <div className="study-actions">
        <button className="btn primary big" disabled={busy} onClick={submit}>
          Submit answers
        </button>
      </div>
    </StudyPage>
  )
}
