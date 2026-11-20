import { useEffect, useId, useRef, useState } from 'react'
import type { Answer, Condition, QuestionnaireForm, QuestionnaireSection } from '../api/types'
import { questionText } from '../lib/questionnaire'
import { Codicon } from './Icons'

interface Props {
  section: QuestionnaireSection
  form: QuestionnaireForm
  valueOf: (condition: Condition, item: string) => Answer['value'] | undefined
  onAnswer: (condition: Condition, item: string, value: Answer['value'] | null) => void
  onContinue: () => void
  busy: boolean
}

export function ComparisonSection({ section, form, valueOf, onAnswer, onContinue, busy }: Props) {
  const [step, setStep] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const navigated = useRef(false)
  const id = useId()
  const reviewing = step === section.questions.length
  const question = section.questions[step]
  const scale = question?.scale
  const numbers = scale ? Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i) : []

  useEffect(() => {
    if (!navigated.current) return
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest' })
  }, [step])

  function goTo(next: number) {
    navigated.current = true
    setStep(next)
  }

  function skip() {
    for (const mode of form.modes) onAnswer(mode.mode, question.key, null)
    goTo(step + 1)
  }

  return (
    <div className="questionnaire-comparison">
      <div className="comparison-progress">
        <span aria-live="polite">{reviewing ? 'Review ratings' : `Question ${question.number} of ${section.questions.length}`}</span>
        <progress aria-label="Question progress" max={section.questions.length} value={Math.min(step + 1, section.questions.length)} />
      </div>

      {reviewing ? (
        <>
          <h3 className="comparison-question comparison-review-title" ref={heading} tabIndex={-1}>Your ratings</h3>
          <ol className="comparison-review">
            {section.questions.map((item, index) => (
              <li key={item.key}>
                <div className="comparison-review-heading">
                  <p>Question {item.number}</p>
                  <button className="icon-btn" type="button" disabled={busy} title={`Change question ${item.number}`} aria-label={`Change question ${item.number}`} onClick={() => goTo(index)}>
                    <Codicon name="edit" />
                  </button>
                </div>
                <dl>
                  {form.modes.map((mode) => (
                    <div key={mode.mode}>
                      <dt>{mode.label}: {questionText(item, mode.mode)}</dt>
                      <dd>{valueOf(mode.mode, item.key) === undefined ? 'Skipped' : `${valueOf(mode.mode, item.key)} / ${item.scale?.max}`}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <h3 className="comparison-question" id={`${id}-statement`} ref={heading} tabIndex={-1}>Question {question.number}</h3>
          <div className="comparison-modes">
            {form.modes.map((mode) => {
              const value = valueOf(mode.mode, question.key)
              return (
                <fieldset key={mode.mode} className="comparison-mode" disabled={busy} aria-labelledby={`${id}-${mode.mode}-label`} aria-describedby={`${id}-statement ${id}-${mode.mode}-endpoints`}>
                  <legend>
                    <span id={`${id}-${mode.mode}-label`}>{mode.label}</span>
                    <button className="icon-btn comparison-clear" type="button" disabled={busy || value === undefined} title={`Clear rating for ${mode.label}`} aria-label={`Clear rating for ${mode.label}`} onClick={() => onAnswer(mode.mode, question.key, null)}>
                      <Codicon name="clear-all" />
                    </button>
                  </legend>
                  <p className="comparison-mode-question">{questionText(question, mode.mode)}</p>
                  <div className="comparison-scale" style={{ gridTemplateColumns: `repeat(${numbers.length}, minmax(0, 1fr))` }}>
                    {numbers.map((number) => (
                      <label key={number}>
                        <input type="radio" name={`${id}-${mode.mode}-${question.key}`} value={number} aria-label={String(number)} checked={value === number} onChange={() => onAnswer(mode.mode, question.key, number)} />
                        <span>{number}</span>
                      </label>
                    ))}
                  </div>
                  <div className="comparison-endpoints" id={`${id}-${mode.mode}-endpoints`}>
                    <span>{scale?.min_label}</span>
                    <span>{scale?.max_label}</span>
                  </div>
                </fieldset>
              )
            })}
          </div>
        </>
      )}

      <div className="comparison-actions">
        <button className="btn secondary" type="button" disabled={busy || step === 0} onClick={() => goTo(step - 1)}><Codicon name="arrow-left" /> Back</button>
        <div>
          {!reviewing && <button className="btn secondary" type="button" disabled={busy} onClick={skip}>Skip <Codicon name="debug-step-over" /></button>}
          <button className="btn primary" type="button" disabled={busy} onClick={() => reviewing ? onContinue() : goTo(step + 1)}>
            {!reviewing && step === section.questions.length - 1 ? 'Review ratings' : 'Continue'}
            <Codicon name={!reviewing && step === section.questions.length - 1 ? 'checklist' : 'arrow-right'} />
          </button>
        </div>
      </div>
    </div>
  )
}
