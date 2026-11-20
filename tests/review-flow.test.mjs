import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const timestamp = '2026-10-11T10:00:00Z'
const finding = { id: 1, actor: 'reviewer', action_type: 'propose_vulnerability', status: 'approved',
  proposal: { description: 'Query built from user input', severity: 'High', file: 'app/auth.py', line: 12 },
  final_proposal: null, result: { item_id: 'V1' }, requested_at: timestamp, decided_at: timestamp }
const fix = { ...finding, id: 2, action_type: 'suggest_fix', status: 'pending',
  proposal: { vulnerability: 'V1', file: 'app/auth.py', location: 'login()', code: 'safe_query()', why: 'Use parameters.' } }
const written = { ...finding, id: 5, action_type: 'write_fix', status: 'written',
  result: { item_id: 'M1', line: 12, offset: 40, after_hash: 'sample-hash', added_lines: 1, removed_lines: 1,
    diff: [{ kind: 'remove', text: 'unsafe_query()' }, { kind: 'add', text: 'safe_query()' }] },
  proposal: { vulnerability: 'V1', file: 'app/auth.py', find: 'unsafe_query()', replace: 'safe_query()', why: 'Use parameters.' } }
const securityTest = { ...finding, id: 3, actor: 'verifier', action_type: 'propose_test', status: 'pending',
  proposal: { path: 'tests/test_security.py', content: 'def test_safe():\n    assert True', vulnerability_ids: ['V1'] } }
const reviewed = { id: 10, role: 'human', thread: 'team', content: 'Please review this code:', data: { snapshot: '01_review', route: ['reviewer'] }, ts: timestamp }
const reviewReply = { id: 11, role: 'agent', thread: 'team', content: 'One vulnerability.', data: { agent: 'reviewer', reply_to: 10, approval_ids: [1] }, ts: timestamp }
const job = (id, agent, status = 'queued') => ({ id, role: 'system', thread: 'team', content: 'Preparing follow-up.',
  data: { kind: 'vulnerability_follow_up', agent, vulnerability_id: 'V1', status }, ts: timestamp })
const finished = (message, approval) => ({ ...message, role: 'agent', content: `${message.data.agent} completed.`,
  data: { ...message.data, status: 'complete', approval_ids: approval ? [approval.id] : [] } })

function fixturesPlugin(stores, api = false) {
  return {
    name: 'review-flow-fixtures', enforce: 'pre',
    resolveId(source) {
      const name = source.split('/').at(-1)
      if (stores.includes(name) && /(?:store\/|^\.\/)/.test(source)) return `\0review-store:${name}`
      if (api && source.endsWith('/api/client')) return '\0review-api'
    },
    load(id) {
      if (id === '\0review-api') return 'export const api = globalThis.reviewApi;'
      if (!id.startsWith('\0review-store:')) return
      const name = id.split(':')[1]
      const hook = `use${name[0].toUpperCase()}${name.slice(1)}`
      return `export const ${hook} = (select) => select(globalThis.reviewFixtures.${name});
        ${hook}.getState = () => globalThis.reviewFixtures.${name};
        export const showError = (error) => globalThis.reviewErrors.push(error);`
    },
  }
}

function resetFixtures() {
  globalThis.reviewErrors = []
  globalThis.reviewFixtures = {
    agents: { messages: [], approvals: [], working: null, sending: null },
    security: { state: { vulnerabilities: [] }, load: async () => {} },
    workspace: { files: { 'tests/test_functional.py': { type: 'file', content: '' } }, dirty: [], load: async () => {}, saveAll: async () => {}, save: async () => {} },
    tests: { running: false },
    ui: { toast: () => {}, showRightTab: () => {}, setBottomTab: () => {} },
  }
}

test('chat review controls and inline decisions reflect the workflow', async (t) => {
  resetFixtures()
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-review-ui-tests', plugins: [fixturesPlugin(['agents', 'security', 'workspace', 'tests', 'ui']), react()], server: { middlewareMode: true, hmr: false } })
  try {
    const { ChatView } = await server.ssrLoadModule('/src/components/ChatView.tsx')
    const { ApprovalsView } = await server.ssrLoadModule('/src/components/Approvals.tsx')
    const { SecurityPanel } = await server.ssrLoadModule('/src/components/SecurityPanel.tsx')
    const render = (mode = 'team') => renderToStaticMarkup(createElement(ChatView, { mode }))

    await t.test('first review has a clear label and no Done ambiguity', () => {
      assert.match(render(), /Ready for review/)
      assert.doesNotMatch(render(), /Done, review my code|Run tests/)
    })

    await t.test('approved findings hide the obsolete no-vulnerabilities notice', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, { id: 14, role: 'system', content:
        'The Test/Verifier writes tests against approved vulnerabilities. There are none yet, so it had nothing to test.', data: {}, ts: timestamp }]
      globalThis.reviewFixtures.agents.approvals = [finding]
      assert.doesNotMatch(render(), /There are none yet/)
      assert.match(render(), /Who should write the fix for V1/)
      assert.match(render(), /Let Code Reviewer implement/)
      assert.match(render(), /I&#x27;ll write the fix/)
      assert.match(render(), /Choose who writes the fix/)
      assert.doesNotMatch(renderToStaticMarkup(createElement(ApprovalsView)), /Who should write the fix/)
    })

    await t.test('both follow-ups show progress at the same time', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, job(12, 'reviewer', 'running'), job(13, 'verifier', 'running')]
      const html = render()
      assert.match(html, /Writing the fix\. The editor is locked/)
      assert.match(html, /Preparing security tests/)
      assert.match(html, /2 follow-ups in progress/)
      assert.match(html, /disabled=""[^>]*>.*Writing fixes and preparing tests/)
      assert.doesNotMatch(html, /Done, review my code/)
    })

    await t.test('developer choice requests guidance without claiming the reviewer is editing', () => {
      const guidance = job(16, 'reviewer', 'running')
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, {
        ...guidance, data: { ...guidance.data, fix_choice: 'developer' },
      }]
      globalThis.reviewFixtures.agents.approvals = [{ ...finding, result: { item_id: 'V1', fix_choice: 'developer' } }]
      const html = render()
      assert.match(html, /Preparing a suggested fix for you to write/)
      assert.match(html, /Preparing fix guidance/)
      assert.doesNotMatch(html, /editor is locked/)
    })

    await t.test('fixes and tests are decided in chat, not the archive', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, finished(job(12, 'reviewer'), fix), finished(job(13, 'verifier'), securityTest)]
      globalThis.reviewFixtures.agents.approvals = [finding, fix, securityTest]
      const html = render()
      assert.match(html, /safe_query\(\)/)
      assert.match(html, /tests\/test_security.py/)
      assert.match(html, /Review proposals \(2\)/)
      assert.equal((html.match(/>\s*Approve<\/button>/g) ?? []).length, 2)
      assert.doesNotMatch(renderToStaticMarkup(createElement(ApprovalsView)), /safe_query\(\)|tests\/test_security.py/)
    })

    await t.test('a fix the Code Reviewer wrote needs no decision and says where it went', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, finished(job(12, 'reviewer'), written)]
      globalThis.reviewFixtures.agents.approvals = [{ ...finding, result: { item_id: 'V1', fix_choice: 'reviewer' } }, written]
      const html = render()
      assert.match(html, /Edited.*app\/auth.py/)
      assert.match(html, /\+1/)
      assert.match(html, /-1/)
      assert.match(html, /View changes/)
      assert.match(html, /Undo/)
      assert.doesNotMatch(html, /unsafe_query\(\)|safe_query\(\)/) // collapsed by default
      assert.doesNotMatch(html, />\s*Approve<\/button>/)
      assert.doesNotMatch(html, /Review proposals/)
      assert.match(renderToStaticMarkup(createElement(ApprovalsView)), /Code edits/)
      assert.match(renderToStaticMarkup(createElement(ApprovalsView)), /mitigations as M1/)
      globalThis.reviewFixtures.agents.approvals = [finding, { ...written, status: 'undone' }]
      const undone = render()
      assert.match(undone, /Undid edit/)
      assert.match(undone, /Undone/)
      assert.doesNotMatch(undone, /Undo edit/)
    })

    await t.test('a failed agent offers retry without hiding its sibling result', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, job(12, 'reviewer', 'failed'), finished(job(13, 'verifier'), securityTest)]
      globalThis.reviewFixtures.agents.approvals = [finding, securityTest]
      assert.match(render(), /The fix could not be written/)
      assert.match(render(), /> Retry<\/button>/)
      assert.match(render(), /tests\/test_security.py/)
    })

    await t.test('decisions unlock tests and updated-code review in both modes', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, finished(job(12, 'reviewer'), fix), finished(job(13, 'verifier'), securityTest)]
      globalThis.reviewFixtures.agents.approvals = [{ ...finding, result: { item_id: 'V1', fix_choice: 'reviewer' } }, { ...fix, status: 'approved' }, { ...securityTest, status: 'approved' }]
      assert.match(render(), /Review updated code/)
      assert.match(render(), />\s*Run tests<\/button>/)
      assert.doesNotMatch(render(), />\s*Approve<\/button>/)
      assert.doesNotMatch(render('single'), /team-progress/)
    })

    await t.test('a Test/Verifier follow-up that proposed no test is not shown', () => {
      const skipped = finished(job(13, 'verifier'))
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, {
        ...skipped, content: 'No new test is needed for V1.', data: { ...skipped.data, hidden: true },
      }]
      globalThis.reviewFixtures.agents.approvals = [finding]
      const html = render()
      assert.doesNotMatch(html, /No new test is needed/)
      assert.match(html, /One vulnerability\./)
    })

    await t.test('a review shows the Test/Verifier report, then the Code Reviewer, with nothing left to retry', () => {
      const report = { id: 15, role: 'agent', thread: 'team', content: 'I ran the unit tests: 3 failed.', data: { agent: 'verifier', reply_to: 10 }, ts: timestamp }
      globalThis.reviewFixtures.agents.messages = [{ ...reviewed, data: { ...reviewed.data, route: ['verifier', 'reviewer'] } }, report, reviewReply]
      globalThis.reviewFixtures.agents.approvals = []
      const html = render()
      assert.match(html, /I ran the unit tests: 3 failed\./)
      assert.ok(html.indexOf('I ran the unit tests') < html.indexOf('One vulnerability.'))
      assert.doesNotMatch(html, /reply is incomplete/)
    })

    await t.test('a Threat Modeller risk example uses the shared labelled code card', () => {
      globalThis.reviewFixtures.agents.messages = [{
        id: 30, role: 'agent', thread: 'team', content: 'Untrusted input reaches the query.',
        data: {
          agent: 'threat_modeller',
          threat_example: {
            path: 'app/auth.py', language: 'python',
            code: 'def login(username):\n    return conn.execute(f"SELECT {username}")',
          },
        },
        ts: timestamp,
      }]
      globalThis.reviewFixtures.agents.approvals = []
      const html = render()
      assert.match(html, /Illustrative risk example/)
      assert.match(html, /app\/auth.py/)
      assert.match(html, /Potentially unsafe pattern to recognise/)
      assert.match(html, /code-copy/)
    })

    await t.test('only findings and mitigations have direct Add controls', () => {
      globalThis.reviewFixtures.security.state = {
        assumptions: [], risks: [], vulnerabilities: [], mitigations: [], tests: [],
      }
      const html = renderToStaticMarkup(createElement(SecurityPanel))
      assert.match(html, /Add to vulnerabilities/)
      assert.match(html, /Add to mitigations/)
      assert.doesNotMatch(html, /Add to assumptions|Add to risks/)
    })
  } finally {
    await server.close()
  }
})

const flush = () => new Promise((resolve) => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('approval-triggered agent work runs concurrently and survives reload/reset', async (t) => {
  resetFixtures()
  let backendMessages = []
  let backendApprovals = []
  let calls = []
  let requests = new Map()
  globalThis.reviewApi = {
    threads: async () => ({ team: backendMessages, assistant: [] }),
    approvals: async () => backendApprovals,
    decide: async () => { backendApprovals = [finding]; return finding },
    chooseFix: async () => {
      backendMessages = [job(20, 'reviewer'), job(21, 'verifier')]
      backendApprovals = [{ ...finding, result: { item_id: 'V1', fix_choice: 'reviewer' } }]
      return backendApprovals[0]
    },
    followUp: (id) => { calls.push(id); const request = deferred(); requests.set(id, request); return request.promise },
  }
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-review-store-tests', plugins: [fixturesPlugin(['security', 'workspace', 'ui'], true)], server: { middlewareMode: true, hmr: false } })
  let store
  try {
    const { useAgents } = await server.ssrLoadModule('/src/store/agents.ts')
    const { useTests } = await server.ssrLoadModule('/src/store/tests.ts')
    store = useAgents

    await t.test('approval waits for a choice, then selected work starts and merges completed placeholders', async () => {
      backendApprovals = [{ ...finding, status: 'pending' }]
      await store.getState().load('team')
      assert.equal(await store.getState().decide(1, 'approve'), null)
      assert.deepEqual(calls, [])
      assert.equal(await store.getState().chooseFix(1, 'reviewer'), null)
      assert.deepEqual(calls, [20, 21])
      backendMessages = [finished(backendMessages[0], fix), backendMessages[1]]
      requests.get(20).resolve({ messages: [backendMessages[0]], approvals: [fix], next: null })
      await flush()
      assert.equal(store.getState().messages.length, 2)
      assert.deepEqual(store.getState().messages.map((m) => m.data.status), ['complete', 'running'])
      backendMessages = [backendMessages[0], finished(backendMessages[1], securityTest)]
      requests.get(21).resolve({ messages: [backendMessages[1]], approvals: [securityTest], next: null })
      await flush()
      assert.deepEqual(store.getState().messages.map((m) => m.role), ['agent', 'agent'])
      assert.deepEqual(store.getState().approvals.map((a) => a.id), [1, 2, 3])
    })

    await t.test('refresh cannot roll completed work or approvals back to pending', async () => {
      backendMessages = [job(20, 'reviewer'), job(21, 'verifier')]
      backendApprovals = [{ ...finding, status: 'pending' }]
      await store.getState().load('team')
      assert.deepEqual(calls, [20, 21])
      assert.ok(store.getState().messages.every((m) => m.data.status === 'complete'))
      assert.equal(store.getState().approvals[0].status, 'approved')
    })

    await t.test('failure leaves the other request running and offers an independent retry', async () => {
      store.getState().reset()
      calls = []
      requests = new Map()
      backendMessages = [job(30, 'reviewer'), job(31, 'verifier')]
      backendApprovals = [finding]
      await store.getState().load('team')
      requests.get(30).reject(new Error('Provider timeout'))
      await flush()
      assert.deepEqual(store.getState().messages.map((m) => m.data.status), ['failed', 'running'])
      store.getState().retryFollowUp(30)
      assert.deepEqual(calls, [30, 31, 30])
      requests.get(30).resolve({ messages: [finished(backendMessages[0], fix)], approvals: [fix], next: null })
      requests.get(31).resolve({ messages: [finished(backendMessages[1], securityTest)], approvals: [securityTest], next: null })
      await flush()
      assert.ok(store.getState().messages.every((m) => m.data.status === 'complete'))
    })

    await t.test('pending jobs resume on load but late replies never enter another part', async () => {
      store.getState().reset()
      calls = []
      requests = new Map()
      backendMessages = [job(40, 'reviewer'), job(41, 'verifier')]
      backendApprovals = [finding]
      await store.getState().load('team')
      assert.deepEqual(calls, [40, 41])
      store.getState().reset()
      backendApprovals = []
      await store.getState().load('single')
      requests.get(40).resolve({ messages: [finished(job(40, 'reviewer'), fix)], approvals: [fix], next: null })
      requests.get(41).resolve({ messages: [finished(job(41, 'verifier'), securityTest)], approvals: [securityTest], next: null })
      await flush()
      assert.deepEqual(store.getState().messages, [])
      assert.deepEqual(store.getState().approvals, [])
    })

    await t.test('reload observes work already running elsewhere and loads its approval cards', async () => {
      store.getState().reset()
      calls = []
      backendMessages = [{ ...job(50, 'verifier', 'running'), data: { ...job(50, 'verifier', 'running').data, started_at: Date.now() / 1000 } }]
      backendApprovals = [finding]
      await store.getState().load('team')
      assert.deepEqual(calls, []) // do not start the model again after browser refresh
      const originalThreads = globalThis.reviewApi.threads
      globalThis.reviewApi.threads = async () => {
        await flush()
        backendApprovals = [finding, securityTest]
        return { team: [finished(backendMessages[0], securityTest)] }
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 2200))
        assert.equal(store.getState().messages[0].data.status, 'complete')
        assert.ok(store.getState().approvals.some((a) => a.id === securityTest.id))
        assert.deepEqual(calls, [])
      } finally {
        globalThis.reviewApi.threads = originalThreads
      }
    })

    await t.test('decisions reload the shared state, a rejected vulnerability too; a fix starts no follow-up', async () => {
      store.getState().reset()
      calls = []
      requests = new Map()
      let loads = 0
      globalThis.reviewFixtures.security.load = async () => { loads++ }
      backendMessages = [finished(job(60, 'reviewer'), fix)]
      backendApprovals = [{ ...finding, status: 'pending' }, fix]
      await store.getState().load('team')
      const originalDecide = globalThis.reviewApi.decide
      globalThis.reviewApi.decide = async (id, decision) => ({
        ...(id === fix.id ? fix : finding), status: decision === 'approve' ? 'approved' : 'rejected',
      })
      try {
        assert.equal(await store.getState().decide(fix.id, 'approve'), null)
        assert.deepEqual(calls, []) // the Test/Verifier never writes tests
        assert.equal(loads, 1) // the approved fix is a planned mitigation
        assert.equal(await store.getState().decide(finding.id, 'reject'), null)
        assert.equal(loads, 2) // the rejected vulnerability stays listed as rejected
      } finally {
        globalThis.reviewApi.decide = originalDecide
      }
    })

    await t.test('choosing reviewer saves first; the written fix then opens in the editor', async () => {
      store.getState().reset()
      calls = []
      requests = new Map()
      const { useDiagnostics } = await server.ssrLoadModule('/src/store/diagnostics.ts')
      const steps = []
      const { workspace, security } = globalThis.reviewFixtures
      workspace.saveAll = async () => { steps.push('save') }
      workspace.load = async () => { steps.push('load code') }
      workspace.open = (path) => steps.push(`open ${path}`)
      security.load = async () => { steps.push('load state') }
      backendMessages = []
      backendApprovals = [{ ...finding, status: 'pending' }]
      await store.getState().load('team')
      const originalDecide = globalThis.reviewApi.decide
      globalThis.reviewApi.decide = async () => {
        steps.push('decide')
        backendApprovals = [finding]
        return finding
      }
      const originalChooseFix = globalThis.reviewApi.chooseFix
      globalThis.reviewApi.chooseFix = async () => {
        steps.push('choose')
        backendMessages = [job(80, 'reviewer')]
        backendApprovals = [{ ...finding, result: { item_id: 'V1', fix_choice: 'reviewer' } }]
        return backendApprovals[0]
      }
      try {
        assert.equal(await store.getState().decide(finding.id, 'approve'), null)
        assert.equal(steps[0], 'decide')
        assert.deepEqual(calls, [])
        assert.equal(await store.getState().chooseFix(finding.id, 'reviewer'), null)
        assert.deepEqual(steps.slice(-2), ['save', 'choose'])
        assert.deepEqual(calls, [80])
        steps.length = 0
        backendMessages = [finished(job(80, 'reviewer'), written)]
        backendApprovals = [finding, written]
        requests.get(80).resolve({ messages: backendMessages, approvals: [written], next: null })
        await new Promise((resolve) => setTimeout(resolve, 20))
        assert.ok(steps.includes('load code') && steps.includes('load state'))
        assert.equal(steps.at(-1), 'open app/auth.py')
        assert.deepEqual(useDiagnostics.getState().target, { path: 'app/auth.py', row: 12, column: 1, focus: false })
        assert.equal(steps.filter((step) => step === 'load code').length, 1)
      } finally {
        globalThis.reviewApi.decide = originalDecide
        globalThis.reviewApi.chooseFix = originalChooseFix
      }
    })

    await t.test('undo saves the file, refreshes code and state, and leaves a visible history entry', async () => {
      store.getState().reset()
      backendMessages = [finished(job(81, 'reviewer'), written)]
      backendApprovals = [written]
      const steps = []
      const { workspace, security } = globalThis.reviewFixtures
      workspace.dirty = []
      workspace.save = async (path) => { steps.push(`save ${path}`) }
      workspace.load = async () => { steps.push('load code') }
      workspace.open = (path) => { steps.push(`open ${path}`) }
      security.load = async () => { steps.push('load state') }
      await store.getState().load('team')
      const originalUndo = globalThis.reviewApi.undoFix
      globalThis.reviewApi.undoFix = async (id) => {
        steps.push(`undo ${id}`)
        backendApprovals = [{ ...written, status: 'undone' }]
        return backendApprovals[0]
      }
      try {
        assert.equal(await store.getState().undoFix(written.id), null)
        assert.equal(store.getState().approvals[0].status, 'undone')
        assert.deepEqual(steps.slice(0, 2), ['save app/auth.py', `undo ${written.id}`])
        assert.ok(steps.includes('load code') && steps.includes('load state'))
        assert.equal(steps.at(-1), 'open app/auth.py')
        assert.equal(store.getState().undoing, false)
      } finally {
        globalThis.reviewApi.undoFix = originalUndo
      }
    })

    await t.test('undo reports a changed file without replacing the local edit', async () => {
      store.getState().reset()
      backendMessages = [finished(job(82, 'reviewer'), written)]
      backendApprovals = [written]
      await store.getState().load('team')
      const originalUndo = globalThis.reviewApi.undoFix
      globalThis.reviewApi.undoFix = async () => { throw new Error('app/auth.py has changed since this fix.') }
      try {
        assert.match(await store.getState().undoFix(written.id), /changed since this fix/)
        assert.equal(store.getState().approvals[0].status, 'written')
        assert.equal(store.getState().undoing, false)
      } finally {
        globalThis.reviewApi.undoFix = originalUndo
      }
    })

    await t.test('a fix choice in progress cannot enter the next part', async () => {
      store.getState().reset()
      backendMessages = []
      backendApprovals = [finding]
      await store.getState().load('team')
      const save = deferred()
      const workspace = globalThis.reviewFixtures.workspace
      const originalSave = workspace.saveAll
      const originalChooseFix = globalThis.reviewApi.chooseFix
      let choseOnNewPart = false
      workspace.saveAll = () => save.promise
      globalThis.reviewApi.chooseFix = async () => { choseOnNewPart = true; return finding }
      try {
        const choosing = store.getState().chooseFix(finding.id, 'reviewer')
        store.getState().reset()
        backendApprovals = []
        await store.getState().load('single')
        save.resolve()
        assert.equal(await choosing, null)
        assert.equal(choseOnNewPart, false)
        assert.deepEqual(store.getState().approvals, [])
      } finally {
        workspace.saveAll = originalSave
        globalThis.reviewApi.chooseFix = originalChooseFix
      }
    })

    await t.test('a Test/Verifier run fills Test Results and the state before the Code Reviewer answers', async () => {
      store.getState().reset()
      let loads = 0
      const tabs = []
      globalThis.reviewFixtures.security.load = async () => { loads++ }
      globalThis.reviewFixtures.ui.setBottomTab = (tab) => tabs.push(tab)
      const run = { status: 'failed', message: '3 failed', counts: { passed: 0, failed: 3, error: 0, skipped: 0 }, tests: [], output: '' }
      const report = { id: 70, role: 'agent', thread: 'team', content: 'I ran the unit tests: 3 failed.', data: { agent: 'verifier', reply_to: 10, run }, ts: timestamp }
      const answer = deferred()
      globalThis.reviewApi.review = async () => ({ messages: [reviewed, report], approvals: [], next: 'reviewer' })
      globalThis.reviewApi.next = () => answer.promise
      const reviewing = store.getState().review('team')
      await flush()
      assert.deepEqual(useTests.getState().result, run)
      assert.deepEqual(tabs, ['tests'])
      assert.equal(loads, 1)
      assert.equal(store.getState().working, 'reviewer') // the results are showing while the Code Reviewer works
      assert.ok(store.getState().messages.some((m) => m.id === report.id))
      answer.resolve({ messages: [reviewReply], approvals: [], next: null })
      await reviewing
      assert.equal(store.getState().working, null)
    })
  } finally {
    store?.getState().reset()
    await server.close()
  }
})
