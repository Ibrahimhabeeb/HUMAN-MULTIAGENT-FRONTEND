import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const state = {
  screen: 'start', mode: 'team', participant: null, pilot: null, part: null, task: null, parts: [], needs_next_task: false,
  available_tasks: [
    { id: 'A', label: 'authentication task', cwe: 'CWE-89' },
    { id: 'B', label: 'file download task', cwe: 'CWE-22' },
    { id: 'C', label: 'comment rendering task', cwe: 'CWE-79' },
    { id: 'D', label: 'preferences import task', cwe: 'CWE-502' },
    { id: 'E', label: 'account email update task', cwe: 'CWE-352' },
    { id: 'F', label: 'document access task', cwe: 'CWE-639' },
    { id: 'G', label: 'account recovery audit task', cwe: 'CWE-532' },
  ],
}
const fixtures = {
  name: 'study-screen-fixtures', enforce: 'pre',
  resolveId(source) {
    if (source.endsWith('/store/study')) return '\0study-screen-state'
    if (source.endsWith('/store/part')) return '\0study-screen-part'
    if (source.endsWith('/api/client')) return '\0study-screen-api'
  },
  load(id) {
    if (id === '\0study-screen-state') return `export const useStudy = (select) => select(globalThis.studyScreenState);
      useStudy.getState = () => globalThis.studyScreenState;`
    if (id === '\0study-screen-part') return 'export const saveEverything = async () => {};'
    if (id === '\0study-screen-api') return 'export const api = {};'
  },
}

test('study screens keep setup, progress and withdrawal messaging consistent', async (t) => {
  globalThis.studyScreenState = { state, busy: false }
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-study-screen-tests', plugins: [fixtures, react()], server: { middlewareMode: true, hmr: false, ws: false } })
  try {
    const { StartScreen } = await server.ssrLoadModule('/src/screens/StartScreen.tsx')
    const { PartCompleteScreen } = await server.ssrLoadModule('/src/screens/PartCompleteScreen.tsx')
    const { StudyPage } = await server.ssrLoadModule('/src/screens/StudyPage.tsx')
    const { ThankYouScreen } = await server.ssrLoadModule('/src/screens/ThankYouScreen.tsx')
    const { ComparisonSection } = await server.ssrLoadModule('/src/components/ComparisonSection.tsx')
    const { QuestionnairePager } = await server.ssrLoadModule('/src/components/QuestionnairePager.tsx')
    const start = () => renderToStaticMarkup(createElement(StartScreen, { state }))

    await t.test('setup requires an explicit task choice and keeps both modes and researcher contact', () => {
      const html = start()
      assert.match(html, /<h1>Secure Coding Room<\/h1>/)
      assert.match(html, /<button[^>]+id="session-task"[^>]+role="combobox"/)
      assert.match(html, /aria-expanded="false"/)
      assert.match(html, /Select a task/)
      assert.match(html, /codicon-chevron-down task-picker-arrow[^>]*aria-hidden="true"/)
      assert.doesNotMatch(html, /task-picker-icon task-a|authentication task/)
      assert.match(html, /<button[^>]+disabled=""[^>]*>.*Start<\/button>/)
      assert.match(html, /aria-pressed="true"[^>]*>.*Team/)
      assert.match(html, /> Start<\/button>/)
      assert.doesNotMatch(html, /New participant|New pilot participant/)
      assert.match(html, /Ibrahim Habeeb-lahi Abiola/)
      assert.match(html, /mailto:hi261@exeter.ac.uk/)
      assert.match(html, /Prof\. Solomon Oyelere/)
      assert.doesNotMatch(html, /DRAFT|CONFIRM|\[NAME/)
      assert.doesNotMatch(html, /University of Exeter|Department of Computer Science|Secure software development research/)
      assert.doesNotMatch(html, /About one hour|One task, two modes|Anonymous participation|study-facts/)
    })

    await t.test('busy setup disables Start, the mode buttons and task selection', () => {
      globalThis.studyScreenState.busy = true
      const html = start()
      assert.match(html, /<button[^>]+role="combobox"[^>]+disabled=""/)
      assert.match(html, /class="task-picker disabled"/)
      assert.equal((html.match(/<button[^>]+disabled=""/g) ?? []).length, 4)
      globalThis.studyScreenState.busy = false
    })

    await t.test('task-two handoff shows the alternate mode and excludes the finished task', () => {
      const handoff = { ...state, screen: 'part_complete', participant: 'P01', mode: 'team', part: 1,
        task: null, needs_next_task: true, available_tasks: state.available_tasks.filter((task) => task.id !== 'A') }
      globalThis.studyScreenState.state = handoff
      const html = renderToStaticMarkup(createElement(PartCompleteScreen, { state: handoff }))
      assert.match(html, /Next: Single assistant/)
      assert.match(html, /Part 2 task/)
      assert.doesNotMatch(html, /authentication task/)
      assert.match(html, /Select a task/)
      assert.match(html, /id="next-task"[^>]+role="combobox"/)
      assert.match(html, /Start Part 2 with Single assistant/)
      assert.match(html, /disabled=""/)
      globalThis.studyScreenState.state = state
    })

    await t.test('the current study phase is announced without adding navigation actions', () => {
      globalThis.studyScreenState.state = { ...state, screen: 'consent' }
      const html = renderToStaticMarkup(createElement(StudyPage, { restart: false }, 'Consent contents'))
      assert.match(html, /aria-label="Study progress"/)
      assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1)
      assert.match(html, /class="current" aria-current="step"[^>]*>.*Consent/)
      assert.doesNotMatch(html, /<button/)
      assert.doesNotMatch(html, /A University of Exeter study|Department of Computer Science|Secure software development research/)
    })

    await t.test('submission confirmation no longer promises later withdrawal', () => {
      const completed = { ...state, screen: 'thank_you', participant: 'P01' }
      globalThis.studyScreenState.state = completed
      const html = renderToStaticMarkup(createElement(ThankYouScreen, { state: completed }))
      assert.match(html, /Your responses have been submitted/)
      assert.match(html, /study data cannot be withdrawn after submission/)
      assert.doesNotMatch(html, /withdraw your data later|only way to find your answers/)
      assert.match(html, />Finish /)
    })

    await t.test('comparison shows one question at a time with its own scale and mode-specific wording', () => {
      const section = { title: 'Confidence and usability', asked_for: 'each_mode', intro: null, questions: [
        { number: 1, key: 'confidence', type: 'scale', text: 'I am confident that the code I completed with the {mode} meets the task requirements.', scale: { min: 1, max: 5, min_label: 'Strongly disagree', max_label: 'Strongly agree' }, allow_not_applicable: false, options: [] },
        { number: 2, key: 'control', type: 'scale', text: 'I felt in control of the {mode}.', scale: { min: 1, max: 5, min_label: 'Strongly disagree', max_label: 'Strongly agree' }, allow_not_applicable: false, options: [] },
      ] }
      const form = { modes: [{ mode: 'team', label: 'Agent team (authentication task)' }, { mode: 'single', label: 'Single assistant (authentication task)' }] }
      const props = { section, form, valueOf: () => undefined, onAnswer: () => {}, onContinue: () => {}, busy: false }
      const render = (changes = {}) => renderToStaticMarkup(createElement(ComparisonSection, { ...props, ...changes }))
      const html = render()
      assert.match(html, /Question 1 of 2/)
      assert.match(html, /code I completed with the agent team meets the task requirements/)
      assert.match(html, /code I completed with the single assistant meets the task requirements/)
      assert.doesNotMatch(html, /I felt in control/)
      assert.equal((html.match(/type="radio"/g) ?? []).length, 10)
      assert.equal(new Set([...html.matchAll(/\bname="([^"]+)"/g)].map((m) => m[1])).size, 2)
      assert.doesNotMatch(html, /checked=""|rating-table/)
      assert.match(html, /disabled=""[^>]*>.*Back/)
      assert.match(html, />Skip /)
      assert.match(html, />Continue/)
      const selected = render({ valueOf: (mode) => mode === 'team' ? 4 : 3 })
      assert.equal((selected.match(/checked=""/g) ?? []).length, 2)
      assert.match(selected, /<input(?=[^>]*value="4")(?=[^>]*checked="")[^>]*>/)
      assert.match(selected, /<input(?=[^>]*value="3")(?=[^>]*checked="")[^>]*>/)
      const disabled = render({ busy: true })
      assert.equal((disabled.match(/<fieldset[^>]+disabled=""/g) ?? []).length, 2)
    })

    await t.test('questionnaire pager shows one text-scale question at a time', () => {
      const form = {
        version: 'v1.3', text_hint: 'Do not include personal details.',
        modes: [{ mode: 'team', label: 'Agent team (authentication task)' }, { mode: 'single', label: 'Single assistant (authentication task)' }],
        sections: [{ title: 'Reliability and caution', show_title: false, intro: null, asked_for: 'each_mode', questions: [
          { number: 1, key: 'vulnerability_risk_trust', type: 'choice', text: 'I trusted the {mode} to identify vulnerabilities and risks.', scale: null, allow_not_applicable: false, options: ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'] },
          { number: 2, key: 'mitigation_trust', type: 'choice', text: 'I trusted the {mode} to recommend mitigations.', scale: null, allow_not_applicable: false, options: ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'] },
          { number: 3, key: 'wariness', type: 'choice', text: 'I was wary of the {mode}.', scale: null, allow_not_applicable: false, options: ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'] },
        ] }],
      }
      const html = renderToStaticMarkup(createElement(QuestionnairePager, { form }))
      assert.match(html, /Question 1 of 3/)
      assert.match(html, /identify vulnerabilities and risks/)
      assert.match(html, /Strongly disagree/)
      assert.match(html, /Strongly agree/)
      assert.doesNotMatch(html, /I was wary/)
      assert.equal((html.match(/class="question-card"/g) ?? []).length, 1)
      assert.match(html, /class="mode-answer-grid paired"/)
      assert.match(html, /Answer once for each mode/)
      assert.equal((html.match(/<section class="mode-answer"/g) ?? []).length, 2)
      assert.match(html, /Page 1 of 3/)
    })
  } finally {
    delete globalThis.studyScreenState
    await server.close()
  }
})
