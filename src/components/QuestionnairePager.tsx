import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Answer, Condition, Mode, Question, QuestionnaireForm, QuestionnaireSection } from '../api/types'
import { questionText } from '../lib/questionnaire'
import { ask } from '../store/dialog'
import { useStudy } from '../store/study'
import { Codicon } from './Icons'

type Value = number | string
type Answers = Record<string, Value>
type Entry = { section: QuestionnaireSection; question: Question }

const keyOf = (condition: Condition, item: string) => `${condition}|${item}`

function QuestionInput({ question, form, label, value, onChange }: {
  question: Question
  form: QuestionnaireForm
  label: string
  value: Value | undefined
  onChange: (value: Value | null) => void
}) {
  if (question.type === 'text') {
    return <textarea className="answer-text" rows={3} maxLength={2000} placeholder={form.text_hint} aria-label={label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
  }

  if (question.type === 'number') {
    const scale = question.scale
    if (!scale) return null
    const answered = typeof value === 'number'
    return (
      <div className="number-answer number-answer-range">
        <div className="range-labels" aria-hidden="true">
          <span>{scale.min_label}</span>
          <output>{answered ? value : 'No rating selected'}</output>
          <span>{scale.max_label}</span>
        </div>
        <input
          type="range"
          min={scale.min}
          max={scale.max}
          step={1}
          aria-label={label}
          aria-valuetext={answered ? `${value}` : 'No rating selected'}
          value={answered ? value : scale.min}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {answered && <button className="clear-answer" type="button" onClick={() => onChange(null)}>Clear</button>}
      </div>
    )
  }

  const options: Value[] = question.type === 'scale'
    ? Array.from({ length: (question.scale?.max ?? 0) - (question.scale?.min ?? 0) + 1 }, (_, i) => (question.scale?.min ?? 0) + i)
    : question.options
  return (
    <div className={question.type === 'scale' ? 'scale-buttons' : 'choice-buttons'} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" className={option === value ? 'on' : ''} aria-pressed={option === value} onClick={() => onChange(option === value ? null : option)}>{option}</button>
      ))}
      {question.allow_not_applicable && (
        <button type="button" className={value === 'Not applicable' ? 'on not-applicable' : 'not-applicable'} aria-pressed={value === 'Not applicable'} onClick={() => onChange(value === 'Not applicable' ? null : 'Not applicable')}>Not applicable</button>
      )}
    </div>
  )
}

function ModeAnswer({ mode, question, form, value, onChange }: {
  mode: { mode: Mode; label: string }
  question: Question
  form: QuestionnaireForm
  value: Value | undefined
  onChange: (value: Value | null) => void
}) {
  const label = questionText(question, mode.mode)
  return (
    <section className="mode-answer" aria-label={mode.label}>
      <div className="mode-answer-label"><Codicon name={mode.mode === 'team' ? 'organization' : 'sparkle'} />{mode.label}</div>
      <p>{label}</p>
      <QuestionInput question={question} form={form} label={label} value={value} onChange={onChange} />
      {question.type === 'scale' && question.scale && <div className="scale-endpoints"><span>{question.scale.min_label}</span><span>{question.scale.max_label}</span></div>}
    </section>
  )
}

function QuestionCard({ entry, previous, form, answers, onAnswer }: {
  entry: Entry
  previous: Entry | undefined
  form: QuestionnaireForm
  answers: Answers
  onAnswer: (condition: Condition, item: string, value: Value | null) => void
}) {
  const { section, question } = entry
  const modes = section.asked_for === 'each_mode'
    ? form.modes
    : section.asked_for === 'team'
      ? form.modes.filter((mode) => mode.mode === 'team')
      : []
  const showSection = section.show_title && previous?.section.title !== section.title

  return (
    <article className="question-card">
      {showSection && <div className="question-card-section"><h2>{section.title}</h2>{section.intro && <p>{section.intro}</p>}</div>}
      <div className="question-card-heading"><span className="question-number">{question.number}</span><span>Question {question.number}</span>{modes.length > 1 && <span className="question-card-hint">Answer once for each mode</span>}</div>
      {section.asked_for === 'once' ? (
        <>
          <p className="question-prompt">{questionText(question)}</p>
          <QuestionInput question={question} form={form} label={questionText(question)} value={answers[keyOf('none', question.key)]} onChange={(value) => onAnswer('none', question.key, value)} />
        </>
      ) : (
        <div className={`mode-answer-grid${modes.length > 1 ? ' paired' : ''}`}>
          {modes.map((mode) => <ModeAnswer key={mode.mode} mode={mode} question={question} form={form} value={answers[keyOf(mode.mode, question.key)]} onChange={(value) => onAnswer(mode.mode, question.key, value)} />)}
        </div>
      )}
    </article>
  )
}

export function QuestionnairePager({ form }: { form: QuestionnaireForm }) {
  const [answers, setAnswers] = useState<Answers>({})
  const [pageIndex, setPageIndex] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const heading = useRef<HTMLDivElement>(null)
  const busy = useStudy((state) => state.busy)
  const entries = useMemo<Entry[]>(() => form.sections.flatMap((section) => section.questions.map((question) => ({ section, question }))), [form])
  // One construct at a time keeps the comparison focused, while still collecting the paired mode responses together.
  const pages = useMemo(() => entries.map((entry) => [entry]), [entries])
  const page = pages[pageIndex] ?? []
  const answeredCount = Object.keys(answers).length

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [pageIndex])

  function answer(condition: Condition, item: string, value: Value | null) {
    setAnswers((previous) => {
      const next = { ...previous }
      if (value === null || value === '') delete next[keyOf(condition, item)]
      else next[keyOf(condition, item)] = value
      return next
    })
  }

  function move(nextIndex: number) {
    setDirection(nextIndex > pageIndex ? 'forward' : 'back')
    setPageIndex(nextIndex)
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

  return (
    <div className="questionnaire-pager">
      <div className="questionnaire-progress" ref={heading} tabIndex={-1}>
        <div><span className="eyebrow">Questionnaire</span><strong aria-live="polite">Question {page[0]?.question.number} of {entries.length}</strong></div>
        <div className="questionnaire-progress-right"><span>{answeredCount} answered</span><progress aria-label="Questionnaire progress" max={pages.length} value={pageIndex + 1} /></div>
      </div>

      <div className="question-slide-viewport">
        <div className={`question-slide ${direction}`} key={pageIndex}>
          {page.map((entry, index) => <QuestionCard key={entry.question.key} entry={entry} previous={index === 0 ? entries[entries.indexOf(entry) - 1] : page[index - 1]} form={form} answers={answers} onAnswer={answer} />)}
        </div>
      </div>

      <div className="questionnaire-pager-actions">
        <button className="btn secondary" type="button" disabled={busy || pageIndex === 0} onClick={() => move(pageIndex - 1)}>Back</button>
        <div><span>Page {pageIndex + 1} of {pages.length}</span>{pageIndex === pages.length - 1 ? <button className="btn primary" type="button" disabled={busy} onClick={submit}>Submit answers</button> : <button className="btn primary" type="button" disabled={busy} onClick={() => move(pageIndex + 1)}>Next question</button>}</div>
      </div>
    </div>
  )
}
