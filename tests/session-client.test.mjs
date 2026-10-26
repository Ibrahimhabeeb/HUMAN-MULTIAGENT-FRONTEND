import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('API requests use tab session storage and never fall back to another participant', async (t) => {
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-session-tests',
    server: { middlewareMode: true, hmr: false, ws: false } })
  const originalFetch = globalThis.fetch
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  } })
  const tokenA = 'a'.repeat(43)
  const tokenB = 'b'.repeat(43)
  const reply = (body, status = 200, headers = {}) => Response.json(body, { status, headers })
  try {
    const { api, ApiError, SESSION_STORAGE_KEY } = await server.ssrLoadModule('/src/api/client.ts')

    await t.test('concurrent initial requests share one bootstrap and send the token in a header', async () => {
      values.clear()
      const calls = []
      globalThis.fetch = async (url, options) => {
        calls.push([url, options])
        if (url === '/api/study/session') return reply({ token: tokenA })
        assert.equal(options.headers['X-Session-Token'], tokenA)
        return reply({})
      }
      await Promise.all([api.state(), api.files()])
      assert.equal(calls.filter(([url]) => url === '/api/study/session').length, 1)
      assert.equal(values.get(SESSION_STORAGE_KEY), tokenA)
      assert.ok(calls.filter(([url]) => url !== '/api/study/session').every(([, options]) => !options.body))
      calls.length = 0
      await api.setMode('single')
      assert.deepEqual(JSON.parse(calls[0][1].body), { mode: 'single' })
      assert.equal(calls[0][1].headers['Content-Type'], 'application/json')
    })

    await t.test('a stored token is reused without creating a new session', async () => {
      const calls = []
      globalThis.fetch = async (url, options) => {
        calls.push(url)
        assert.equal(options.headers['X-Session-Token'], tokenA)
        return reply({})
      }
      await api.state()
      assert.deepEqual(calls, ['/api/study/state'])
    })

    await t.test('expired state starts fresh without replaying a mutating request', async () => {
      values.set(SESSION_STORAGE_KEY, tokenA)
      const calls = []
      globalThis.fetch = async (url, options) => {
        calls.push([url, options])
        if (url === '/api/study/session') return reply({ token: tokenB })
        if (options.headers['X-Session-Token'] === tokenA) return reply({ detail: 'Session ended' }, 401)
        return reply({ screen: 'start', participant: null })
      }
      const state = await api.state()
      assert.equal(state.screen, 'start')
      assert.equal(values.get(SESSION_STORAGE_KEY), tokenB)
      assert.equal(calls.length, 3)
      values.set(SESSION_STORAGE_KEY, tokenA)
      calls.length = 0
      await assert.rejects(api.done(), (error) => error instanceof ApiError && error.status === 401)
      assert.equal(calls.length, 1)
      assert.equal(values.has(SESSION_STORAGE_KEY), false)
    })

    await t.test('restart rotates the token and discards a late response from the previous session', async () => {
      values.set(SESSION_STORAGE_KEY, tokenA)
      let completeFiles
      globalThis.fetch = async (url) => {
        if (url === '/api/workspace/files') return new Promise((resolve) => { completeFiles = resolve })
        return reply({ screen: 'start' }, 200, { 'X-Session-Token': tokenB })
      }
      const files = api.files()
      await new Promise((resolve) => setImmediate(resolve))
      await api.restart()
      assert.equal(values.get(SESSION_STORAGE_KEY), tokenB)
      completeFiles(reply({ private: 'old participant data' }))
      await assert.rejects(files, (error) => error.status === 409)
      assert.equal(values.get(SESSION_STORAGE_KEY), tokenB)
    })

    await t.test('a late unauthorized response cannot clear a replacement token', async () => {
      values.set(SESSION_STORAGE_KEY, tokenA)
      let completeFiles
      globalThis.fetch = async (url) => {
        if (url === '/api/workspace/files') return new Promise((resolve) => { completeFiles = resolve })
        return reply({ screen: 'start' }, 200, { 'X-Session-Token': tokenB })
      }
      const files = api.files()
      await new Promise((resolve) => setImmediate(resolve))
      await api.restart()
      completeFiles(reply({ detail: 'Old session ended' }, 401))
      await assert.rejects(files, (error) => error.status === 401)
      assert.equal(values.get(SESSION_STORAGE_KEY), tokenB)
    })

    await t.test('a response body finishing after restart cannot enter the new session', async () => {
      values.set(SESSION_STORAGE_KEY, tokenA)
      let finishBody
      globalThis.fetch = async (url) => {
        if (url === '/api/workspace/files') return {
          ok: true, status: 200, headers: new Headers(),
          json: () => new Promise((resolve) => { finishBody = resolve }),
        }
        return reply({ screen: 'start' }, 200, { 'X-Session-Token': tokenB })
      }
      const files = api.files()
      await new Promise((resolve) => setImmediate(resolve))
      await api.restart()
      finishBody({ private: 'previous participant' })
      await assert.rejects(files, (error) => error.status === 409)
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
    else delete globalThis.sessionStorage
    await server.close()
  }
})
