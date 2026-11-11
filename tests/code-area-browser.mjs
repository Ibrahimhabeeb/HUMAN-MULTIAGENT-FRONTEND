import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

// Serve isolated fixtures: no study API requests, participant files or AI calls.
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-browser-check', plugins: [react(), {
  name: 'editor-browser-fixtures', enforce: 'pre',
  resolveId(source) {
    if (/(?:store\/|^\.\/)(workspace|tests)$/.test(source)) return `\0browser-store:${source.split('/').at(-1)}`
  },
  load(id) {
    if (id === '\0browser-store:workspace') return `
      import { create } from 'zustand';
      export const useWorkspace = create((set) => ({
        files: { 'app/auth.py': { type: 'file', content: 'print(missing)' }, 'app/extra.py': { type: 'file', content: '# Another file\\nprint(missing)' } },
        openPaths: ['app/auth.py'], selectedPath: 'app/auth.py', dirty: [],
        open: (path) => set((s) => ({ selectedPath: path, openPaths: [...new Set([...s.openPaths, path])] })),
        close: () => {}, saveAll: async () => {},
        edit: (path, content) => set((s) => ({ files: { ...s.files, [path]: { type: 'file', content } }, dirty: [path] })),
      }));`
    if (id === '\0browser-store:tests') return `import { create } from 'zustand'; export const useTests = create(() => ({ result: null, running: false, run: () => {} }));`
  },
  configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/_code-area-check') return next()
      res.setHeader('Content-Type', 'text/html')
      res.end(await vite.transformIndexHtml(req.url, '<html><head><title>Code Area Check</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/tests/fixtures/code-area.tsx"></script></body></html>'))
    })
  },
}], server: { host: '127.0.0.1', port: 0, hmr: false, ws: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  let lintCalls = 0
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    if (route.request().url().endsWith('/workspace/completions')) {
      await route.fulfill({ json: { items: [] } })
      return
    }
    if (!route.request().url().endsWith('/workspace/lint')) {
      errors.push('Fixture attempted to access a live study endpoint')
      await route.abort()
      return
    }
    lintCalls++
    const { path, content } = route.request().postDataJSON()
    const row = content.split('\n').findIndex((line) => line.includes('missing')) + 1
    await route.fulfill({ json: { path, diagnostics: row ? [{ code: 'F821', message: 'Undefined name `missing`', severity: 'error', location: { row, column: 7 }, end_location: { row, column: 14 } }] : [] } })
  })
  const address = server.httpServer.address()
  await page.goto(`http://127.0.0.1:${address.port}/_code-area-check`)
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.code-block .hljs-keyword').first()).toBeVisible()
  await page.getByRole('button', { name: 'Copy code', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), 'def login():\n    return "safe"\n')

  await page.getByRole('button', { name: /^Problems/ }).click()
  await expect(page.locator('.lint-problem')).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => window.editorCheck.getModelMarkers({ owner: 'ruff' }).length)).toBe(1)
  await page.locator('.lint-problem[title="app/extra.py:2:7"]').click()
  await expect.poll(() => page.evaluate(() => window.editorCheck.getEditors()[0].getModel()?.uri.toString())).toBe('file:///app/extra.py')
  await expect.poll(() => page.evaluate(() => window.editorCheck.getEditors()[0].getPosition()?.lineNumber)).toBe(2)
  await expect.poll(() => page.evaluate(() => window.editorCheck.getEditors()[0].getPosition()?.column)).toBe(7)
  await expect.poll(() => page.evaluate(() => window.editorCheck.getModelMarkers({ owner: 'ruff' }).length)).toBe(2)

  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('print("fixed")')
  await expect(page.locator('.lint-problem')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => window.editorCheck.getModelMarkers({ owner: 'ruff' }).length)).toBe(1)
  await expect(page.getByTitle('Check Python files')).toBeEnabled()
  assert.ok(lintCalls >= 3)

  await page.screenshot({ path: 'node_modules/.tmp/code-area-desktop.png' })
  await page.evaluate(() => {
    document.querySelector('#root > div').style.gridTemplateColumns = 'minmax(0, 1fr)'
    document.querySelector('#root > div > div').style.display = 'none'
  })
  await page.setViewportSize({ width: 375, height: 760 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.ok(await page.locator('.code-block').evaluateAll((blocks) => blocks.every((block) => block.getBoundingClientRect().right <= innerWidth)))
  await page.screenshot({ path: 'node_modules/.tmp/code-area-narrow.png' })
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied') } } }))
  await page.getByRole('button', { name: 'Copy code', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'Copy failed. Try again.', exact: true })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('Browser checks passed: highlighting, exact clipboard text, copy failure, Python markers, cross-file navigation, live updates and narrow layout.')
} finally {
  await browser?.close()
  await server.close()
}
