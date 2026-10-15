import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const state = {
  screen: 'start', mode: 'team', participant: null, pilot: null, part: null, task: null, parts: [],
  available_tasks: [{ id: 'A', label: 'authentication task' }, { id: 'B', label: 'file download task' }],
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
    const { StudyPage } = await server.ssrLoadModule('/src/screens/StudyPage.tsx')
    const { ThankYouScreen } = await server.ssrLoadModule('/src/screens/ThankYouScreen.tsx')
    const { ComparisonSection } = await server.ssrLoadModule('/src/components/ComparisonSection.tsx')
    const start = () => renderToStaticMarkup(createElement(StartScreen, { state }))

    await t.test('setup has both tasks, both modes and the real researcher contact', () => {
      const html = start()
      assert.match(html, /<h1>Secure Coding Room<\/h1>/)
      assert.match(html, /<select[^>]+class="task-select"[^>]+id="session-task"/)
      assert.match(html, /class="task-picker-icon task-a"/)
      assert.match(html, /codicon-chevron-down task-picker-arrow[^>]*aria-hidden="true"/)
      assert.match(html, /authentication task/)
      assert.match(html, /file download task/)
      assert.match(html, /aria-pressed="true"[^>]*>.*Team/)
      assert.match(html, /New participant/)
      assert.match(html, /New pilot participant/)
      assert.match(html, /Ibrahim Habeeb-lahi Abiola/)
      assert.match(html, /mailto:hi261@exeter.ac.uk/)
      assert.match(html, /Prof\. Solomon Oyelere/)
      assert.doesNotMatch(html, /DRAFT|CONFIRM|\[NAME/)
      assert.doesNotMatch(html, /University of Exeter|Department of Computer Science|Secure software development research/)
      assert.doesNotMatch(html, /About one hour|One task, two modes|Anonymous participation|study-facts/)
    })

    await t.test('busy setup disables both participant buttons and task selection', () => {
      globalThis.studyScreenState.busy = true
      const html = start()
      assert.match(html, /<select[^>]+disabled=""/)
      assert.match(html, /class="task-picker disabled"/)
      assert.equal((html.match(/<button[^>]+disabled=""/g) ?? []).length, 4)
      globalThis.studyScreenState.busy = false
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

    await t.test('comparison shows only one statement with two independent optional rating groups', () => {
      const section = { title: 'Both ways of working', asked_for: 'each_mode', intro: null, questions: [
        { key: 'confidence', type: 'scale', text: 'I am confident that my final code is secure.' },
        { key: 'control', type: 'scale', text: 'I felt in control of the decisions and the code.' },
      ] }
      const form = { scale: { min: 1, max: 7, min_label: 'Strongly disagree', max_label: 'Strongly agree' },
        modes: [{ mode: 'team', label: 'Agent team (authentication task)' }, { mode: 'single', label: 'Single assistant (authentication task)' }] }
      const props = { section, form, valueOf: () => undefined, onAnswer: () => {}, onContinue: () => {}, busy: false }
      const render = (changes = {}) => renderToStaticMarkup(createElement(ComparisonSection, { ...props, ...changes }))
      const html = render()
      assert.match(html, /Statement 1 of 2/)
      assert.match(html, /I am confident that my final code is secure/)
      assert.doesNotMatch(html, /I felt in control/)
      assert.equal((html.match(/type="radio"/g) ?? []).length, 14)
      assert.equal(new Set([...html.matchAll(/\bname="([^"]+)"/g)].map((m) => m[1])).size, 2)
      assert.doesNotMatch(html, /checked=""|rating-table/)
      assert.match(html, /disabled=""[^>]*>.*Back/)
      assert.match(html, />Skip /)
      assert.match(html, />Continue/)
      const selected = render({ valueOf: (mode) => mode === 'team' ? 6 : 3 })
      assert.equal((selected.match(/checked=""/g) ?? []).length, 2)
      assert.match(selected, /<input(?=[^>]*value="6")(?=[^>]*checked="")[^>]*>/)
      assert.match(selected, /<input(?=[^>]*value="3")(?=[^>]*checked="")[^>]*>/)
      const disabled = render({ busy: true })
      assert.equal((disabled.match(/<fieldset[^>]+disabled=""/g) ?? []).length, 2)
    })
  } finally {
    delete globalThis.studyScreenState
    await server.close()
  }
})
