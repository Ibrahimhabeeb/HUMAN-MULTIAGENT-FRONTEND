import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

test('chat and proposal code blocks are highlighted, copyable and escaped', async (t) => {
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-code-tests', plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false } })
  try {
    const { CodeBlock } = await server.ssrLoadModule('/src/components/CodeBlock.tsx')
    const { Markdown } = await server.ssrLoadModule('/src/components/Markdown.tsx')
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
    await t.test('fixes show the full path, exact location and syntax tokens', () => {
      const html = render(CodeBlock, { path: 'app/auth.py', location: 'login(), replace lines 12-14', code: 'def login():\n    return "safe"' })
      assert.match(html, /app\/auth\.py/)
      assert.match(html, /Location:/)
      assert.match(html, /replace lines 12-14/)
      assert.match(html, /hljs-keyword/)
      assert.match(html, /hljs-string/)
      assert.match(html, /aria-label="Copy code"/)
    })
    await t.test('both labelled and unlabelled Markdown fences use the shared code block', () => {
      for (const language of ['python', '']) {
        const html = render(Markdown, { text: `\`\`\`${language}\ndef login():\n    return True\n\`\`\`` })
        assert.match(html, /code-block-header/)
        assert.match(html, /hljs-keyword/)
        assert.match(html, /Copy code/)
        assert.match(html, /\n    /)
      }
      assert.doesNotMatch(render(Markdown, { text: 'Use `login()` here.' }), /code-block-header|Copy code/)
    })
    await t.test('code cannot inject HTML, including unknown languages', () => {
      for (const language of ['python', 'unknown']) {
        const html = render(CodeBlock, { language, code: '<script>alert("x")</script>' })
        assert.doesNotMatch(html, /<script>/)
        assert.match(html, /&lt;/)
      }
      assert.doesNotMatch(render(Markdown, { text: '```html\n<img src=x onerror="alert(1)">\n```' }), /<img/)
    })
  } finally {
    await server.close()
  }
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
const files = (content = 'print(missing)') => ({ 'app/auth.py': { type: 'file', content }, 'README.md': { type: 'file', content: '# Task' } })
const issue = { code: 'F821', message: 'Undefined name `missing`', severity: 'error', location: { row: 1, column: 7 }, end_location: { row: 1, column: 14 } }

test('live diagnostics handle edits, deletion, retry and study-part resets', async (t) => {
  const calls = []
  globalThis.lintFixture = (path, content, signal) => {
    const pending = deferred()
    calls.push({ path, content, signal, ...pending })
    return pending.promise
  }
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-lint-tests', plugins: [{
    name: 'lint-fixtures', enforce: 'pre',
    resolveId(source) { if (source.endsWith('/api/linting')) return '\0lint-api' },
    load(id) { if (id === '\0lint-api') return 'export const lintFile = (...args) => globalThis.lintFixture(...args)' },
  }], server: { middlewareMode: true, hmr: false, ws: false } })
  let store
  try {
    const { useDiagnostics } = await server.ssrLoadModule('/src/store/diagnostics.ts')
    store = useDiagnostics
    await t.test('typing is debounced and only Python files are checked', async () => {
      store.getState().sync(files('first'))
      store.getState().sync(files('second'))
      assert.equal(calls.length, 0)
      assert.equal(store.getState().files['app/auth.py'].checking, true)
      await new Promise((resolve) => setTimeout(resolve, 760))
      assert.equal(calls.length, 1)
      assert.equal(calls[0].content, 'second')
      calls[0].resolve({ path: 'app/auth.py', diagnostics: [issue] })
      await flush()
      assert.deepEqual(store.getState().files['app/auth.py'].diagnostics, [issue])
      store.getState().sync(files('second'))
      assert.equal(calls.length, 1)
    })
    await t.test('an older response cannot overwrite diagnostics for newer code', async () => {
      store.getState().sync(files('old'), true)
      const old = calls.at(-1)
      store.getState().sync(files('new'), true)
      const fresh = calls.at(-1)
      assert.equal(old.signal.aborted, true)
      assert.deepEqual(store.getState().files['app/auth.py'].diagnostics, [])
      fresh.resolve({ path: 'app/auth.py', diagnostics: [] })
      await flush()
      old.resolve({ path: 'app/auth.py', diagnostics: [issue] })
      await flush()
      assert.deepEqual(store.getState().files['app/auth.py'].diagnostics, [])
    })
    await t.test('late responses from another study part are discarded', async () => {
      store.getState().sync(files('part 1'), true)
      const old = calls.at(-1)
      store.getState().reset()
      store.getState().sync(files('part 2'), true)
      const fresh = calls.at(-1)
      old.resolve({ path: 'app/auth.py', diagnostics: [issue] })
      await flush()
      assert.equal(store.getState().files['app/auth.py'].checking, true)
      fresh.resolve({ path: 'app/auth.py', diagnostics: [] })
      await flush()
    })
    await t.test('deleted files clear diagnostics and navigation targets', async () => {
      store.getState().sync(files(), true)
      const old = calls.at(-1)
      store.getState().navigate('app/auth.py', 1, 7)
      store.getState().sync({})
      old.resolve({ path: 'app/auth.py', diagnostics: [issue] })
      await flush()
      assert.deepEqual(store.getState().files, {})
      assert.equal(store.getState().target, null)
    })
    await t.test('service errors stay visible and a manual check can recover', async () => {
      store.getState().sync(files(), true)
      calls.at(-1).reject(new Error('Ruff unavailable'))
      await flush()
      assert.equal(store.getState().files['app/auth.py'].error, 'Ruff unavailable')
      assert.equal(store.getState().files['app/auth.py'].checking, false)
      store.getState().sync(files(), true)
      calls.at(-1).resolve({ path: 'app/auth.py', diagnostics: [] })
      await flush()
      assert.equal(store.getState().files['app/auth.py'].error, null)
    })
  } finally {
    store?.getState().reset()
    await server.close()
    delete globalThis.lintFixture
  }
})
