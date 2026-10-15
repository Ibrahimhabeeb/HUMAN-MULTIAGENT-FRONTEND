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
    ui: { toast: () => {}, showRightTab: () => {} },
  }
}

test('chat review controls and inline decisions reflect the workflow', async (t) => {
  resetFixtures()
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-review-ui-tests', plugins: [fixturesPlugin(['agents', 'security', 'workspace', 'tests', 'ui']), react()], server: { middlewareMode: true, hmr: false } })
  try {
    const { ChatView } = await server.ssrLoadModule('/src/components/ChatView.tsx')
    const { ApprovalsView } = await server.ssrLoadModule('/src/components/Approvals.tsx')
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
      assert.match(render(), /Review updated code/)
    })

    await t.test('both follow-ups show progress at the same time', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, job(12, 'reviewer', 'running'), job(13, 'verifier', 'running')]
      const html = render()
      assert.match(html, /Preparing fix suggestions/)
      assert.match(html, /Preparing security tests/)
      assert.match(html, /2 follow-ups in progress/)
      assert.match(html, /disabled=""[^>]*>.*Preparing fixes and tests/)
      assert.doesNotMatch(html, /Done, review my code/)
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

    await t.test('a failed agent offers retry without hiding its sibling result', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, job(12, 'reviewer', 'failed'), finished(job(13, 'verifier'), securityTest)]
      assert.match(render(), /Fix suggestions could not be prepared/)
      assert.match(render(), /> Retry<\/button>/)
      assert.match(render(), /tests\/test_security.py/)
    })

    await t.test('decisions unlock tests and updated-code review in both modes', () => {
      globalThis.reviewFixtures.agents.messages = [reviewed, reviewReply, finished(job(12, 'reviewer'), fix), finished(job(13, 'verifier'), securityTest)]
      globalThis.reviewFixtures.agents.approvals = [finding, { ...fix, status: 'approved' }, { ...securityTest, status: 'approved' }]
      assert.match(render(), /Review updated code/)
      assert.match(render(), />\s*Run tests<\/button>/)
      assert.doesNotMatch(render(), />\s*Approve<\/button>/)
      assert.doesNotMatch(render('single'), /team-progress/)
    })

    await t.test('old review routes do not leave a redundant Verifier Continue button', () => {
      globalThis.reviewFixtures.agents.messages = [{ ...reviewed, data: { ...reviewed.data, route: ['reviewer', 'verifier'] } }, reviewReply]
      assert.doesNotMatch(render(), /hasn&#x27;t answered yet|>Continue<\/button>/)
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
    decide: async () => { backendMessages = [job(20, 'reviewer'), job(21, 'verifier')]; backendApprovals = [finding]; return finding },
    followUp: (id) => { calls.push(id); const request = deferred(); requests.set(id, request); return request.promise },
  }
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-review-store-tests', plugins: [fixturesPlugin(['security', 'workspace', 'ui'], true)], server: { middlewareMode: true, hmr: false } })
  let store
  try {
    const { useAgents } = await server.ssrLoadModule('/src/store/agents.ts')
    store = useAgents

    await t.test('approval starts both requests immediately and merges completed placeholders', async () => {
      backendApprovals = [{ ...finding, status: 'pending' }]
      await store.getState().load('team')
      assert.equal(await store.getState().decide(1, 'approve'), null)
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
  } finally {
    store?.getState().reset()
    await server.close()
  }
})
